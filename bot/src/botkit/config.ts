/**
 * 外部目录的地址和签名公钥（私钥只在发布机器上）。Boost 默认关闭外部目录，内置 Bot 由宿主登记。
 * 显式配置 AMB_CATALOG_URL、AMB_CATALOG_PUBKEY 后启用；AMB_CATALOG=off 始终优先关闭外部目录。
 */
export const CATALOG_URL = "";
export const CATALOG_PUBLIC_KEY = "";

export function catalogConfig(env: NodeJS.ProcessEnv = process.env): { url: string; publicKey: string } {
  if (env.AMB_CATALOG === "off") return { url: "", publicKey: "" };
  return { url: env.AMB_CATALOG_URL || CATALOG_URL, publicKey: env.AMB_CATALOG_PUBKEY || CATALOG_PUBLIC_KEY };
}
