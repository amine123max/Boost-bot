use std::future::Future;
use std::sync::{Arc, OnceLock};
use std::task::{Context, Poll, Wake, Waker};
use std::time::{Duration, Instant};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

pub(super) const RPC_QUEUE_WAIT_TIMEOUT: Duration = Duration::from_secs(60);
const RPC_CONCURRENCY: usize = 6;
const RPC_MAX_WAITING: usize = 256;

/// Shared by all users, connections and HTTP entrypoints in one service process.
pub(super) struct RpcQueue {
    running: Arc<Semaphore>,
    admitted: Arc<Semaphore>,
}

pub(super) struct RpcPermit {
    _running: OwnedSemaphorePermit,
    _admitted: OwnedSemaphorePermit,
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum QueueError {
    Full,
    Timeout,
}

impl RpcQueue {
    fn new(concurrency: usize, max_waiting: usize) -> Self {
        Self {
            running: Arc::new(Semaphore::new(concurrency)),
            admitted: Arc::new(Semaphore::new(concurrency + max_waiting)),
        }
    }

    // Holding the admission permit also bounds futures waiting for execution.
    async fn acquire_slot(&self) -> Result<RpcPermit, QueueError> {
        let admitted = self
            .admitted
            .clone()
            .try_acquire_owned()
            .map_err(|_| QueueError::Full)?;
        let running = self
            .running
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| QueueError::Full)?;
        Ok(RpcPermit {
            _running: running,
            _admitted: admitted,
        })
    }

    pub(super) async fn acquire(&self) -> Result<RpcPermit, QueueError> {
        self.acquire_with_timeout(RPC_QUEUE_WAIT_TIMEOUT).await
    }

    async fn acquire_with_timeout(&self, timeout: Duration) -> Result<RpcPermit, QueueError> {
        tokio::time::timeout(timeout, self.acquire_slot())
            .await
            .map_err(|_| QueueError::Timeout)?
    }

    /// The legacy tiny_http workers have no Tokio runtime. A thread waker lets
    /// them use the same fair semaphore as Axum, without a second queue/pool.
    pub(super) fn acquire_blocking(&self) -> Result<RpcPermit, QueueError> {
        struct ThreadWaker(std::thread::Thread);
        impl Wake for ThreadWaker {
            fn wake(self: Arc<Self>) {
                self.0.unpark();
            }
            fn wake_by_ref(self: &Arc<Self>) {
                self.0.unpark();
            }
        }
        let waker = Waker::from(Arc::new(ThreadWaker(std::thread::current())));
        let mut context = Context::from_waker(&waker);
        let mut future = std::pin::pin!(self.acquire_slot());
        let deadline = Instant::now() + RPC_QUEUE_WAIT_TIMEOUT;
        loop {
            if let Poll::Ready(result) = future.as_mut().poll(&mut context) {
                return result;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(QueueError::Timeout);
            }
            std::thread::park_timeout(remaining);
        }
    }
}

pub(super) fn global() -> &'static RpcQueue {
    static QUEUE: OnceLock<RpcQueue> = OnceLock::new();
    QUEUE.get_or_init(|| RpcQueue::new(RPC_CONCURRENCY, RPC_MAX_WAITING))
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::FutureExt;

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    #[test]
    fn clients_share_one_fifo_queue_and_cancelled_waiters_release_capacity() {
        let queue = RpcQueue::new(1, 2);
        let first = queue.acquire_blocking().unwrap();
        let mut second = Box::pin(queue.acquire_slot());
        let mut third = Box::pin(queue.acquire_slot());
        assert!(second.as_mut().now_or_never().is_none());
        assert!(third.as_mut().now_or_never().is_none());
        assert!(matches!(
            queue.acquire_slot().now_or_never(),
            Some(Err(QueueError::Full))
        ));
        drop(first);
        assert!(
            third.as_mut().now_or_never().is_none(),
            "later users cannot jump the queue"
        );
        let second = second.as_mut().now_or_never().unwrap().unwrap();
        drop(third);
        assert_eq!(queue.admitted.available_permits(), 2);
        drop(second);
        assert_eq!(queue.running.available_permits(), 1);
        assert_eq!(queue.admitted.available_permits(), 3);
    }

    #[test]
    fn async_and_legacy_clients_share_the_same_limit() {
        let queue = Arc::new(RpcQueue::new(2, 8));
        let first = queue.acquire_blocking().unwrap();
        runtime().block_on(async {
            let second = queue.acquire().await.unwrap();
            assert_eq!(queue.running.available_permits(), 0);
            let mut waiting = Box::pin(queue.acquire());
            assert!(waiting.as_mut().now_or_never().is_none());
            drop(first);
            let third = waiting.await.unwrap();
            assert_eq!(queue.running.available_permits(), 0);
            drop(second);
            drop(third);
        });
        assert_eq!(queue.running.available_permits(), 2);
    }

    #[test]
    fn panic_releases_the_slot_for_the_next_user() {
        let queue = RpcQueue::new(1, 1);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _permit = queue.acquire_blocking().unwrap();
            panic!("simulated RPC panic");
        }));
        assert!(result.is_err());
        assert!(queue.acquire_blocking().is_ok());
    }

    #[test]
    fn queue_timeout_removes_the_request_without_executing_it() {
        let queue = RpcQueue::new(1, 1);
        let first = queue.acquire_blocking().unwrap();
        runtime().block_on(async {
            let result = queue.acquire_with_timeout(Duration::from_millis(1)).await;
            assert!(matches!(result, Err(QueueError::Timeout)));
        });
        assert_eq!(queue.admitted.available_permits(), 1);
        drop(first);
        assert!(queue.acquire_blocking().is_ok());
    }

    #[test]
    fn legacy_client_waits_for_an_async_clients_slot() {
        let queue = Arc::new(RpcQueue::new(1, 1));
        let permit = runtime().block_on(queue.acquire()).unwrap();
        let other = queue.clone();
        let worker = std::thread::spawn(move || other.acquire_blocking().is_ok());
        drop(permit);
        assert!(worker.join().unwrap());
    }

    #[test]
    fn the_service_queue_is_process_global() {
        assert!(std::ptr::eq(global(), global()));
    }
}
