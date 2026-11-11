#!/usr/bin/env bash
# SEC EDGAR access for the research bot. Run it from the workspace root.
# Every call saves the raw response under app/reports/<run-id>/raw/ and appends one line to
# app/reports/<run-id>/tools.jsonl, so the numbers in a report can be traced to what SEC returned.
#
#   sec.sh <run-id> lookup  <ticker or company name>
#   sec.sh <run-id> concept <cik> <taxonomy/Tag> [annual|quarterly]
#   sec.sh <run-id> filings <cik> [form] [count]
#   sec.sh <run-id> read    <https://www.sec.gov/... document url>
#   sec.sh <run-id> note    <tool> <text>
set -u

MAX_STEPS=20
MAX_REPEATS=3
UA='AnyModelBot support@anymodel.bot'

die() {
  echo "error: $*" >&2
  exit 1
}

[ $# -ge 2 ] || die "usage: sec.sh <run-id> <lookup|concept|filings|read|note> ..."
run=$1
cmd=$2
shift 2

[[ "$run" =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]] || die "run-id may only use lowercase letters, digits and hyphens"
[ -d app ] || die "run this from the workspace root (no app/ folder here)"

dir="app/reports/$run"
raw="$dir/raw"
trace="$dir/tools.jsonl"
mkdir -p "$raw" || die "cannot create $raw"
[ -f "$trace" ] || : >"$trace"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# log <tool> <target> <url> <status> <file> <bytes> <cached>. Inputs are validated below, so they hold no JSON specials.
log() {
  printf '{"ts":"%s","tool":"%s","target":"%s","url":"%s","status":%s,"file":"%s","bytes":%s,"cached":%s}\n' \
    "$(now)" "$1" "$2" "$3" "$4" "$5" "$6" "$7" >>"$trace"
}

count_calls() { grep -c '"status":' "$trace" 2>/dev/null || true; }
count_steps() { grep -c '"cached":false' "$trace" 2>/dev/null || true; }
count_same() { grep -cF "\"tool\":\"$1\",\"target\":\"$2\"," "$trace" 2>/dev/null || true; }

# guard <tool> <target>: stops loops and runaway research before any network call.
guard() {
  local same steps
  same=$(count_same "$1" "$2")
  steps=$(count_steps)
  [ "$same" -lt "$MAX_REPEATS" ] || die "this exact call already ran $same times. Stop repeating it and report what you have."
  if [ "$same" -eq 0 ] && [ "$steps" -ge "$MAX_STEPS" ]; then
    die "step limit reached ($MAX_STEPS). Stop fetching, write the report, and list what is missing under limitations."
  fi
}

# get <url> <dest>: prints the HTTP status, or 000 when the request itself failed. curl retries 429 and 5xx with backoff.
get() {
  local code
  if ! code=$(curl -sS -L --proto '=https' --max-redirs 3 --retry 3 --retry-delay 2 --max-time 120 --max-filesize 33554432 \
    --compressed -A "$UA" -o "$2.part" -w '%{http_code}' "$1"); then
    code=000
  fi
  if [ "$code" = "200" ]; then
    mv "$2.part" "$2"
  else
    rm -f "$2.part"
  fi
  echo "$code"
}

size_of() { wc -c <"$1" | tr -d ' '; }

# fetch <tool> <target> <url> <extension>: sets $file (workspace path) and $file_rel (relative to the run folder), or stops.
fetch() {
  local tool=$1 target=$2 url=$3 ext=$4 same code name
  guard "$tool" "$target"
  same=$(count_same "$tool" "$target")
  if [ "$same" -gt 0 ]; then
    file_rel=$(grep -F "\"tool\":\"$tool\",\"target\":\"$target\"," "$trace" | head -n 1 | sed 's/.*"file":"\([^"]*\)".*/\1/')
    if [ -n "$file_rel" ] && [ -f "$dir/$file_rel" ]; then
      file="$dir/$file_rel"
      log "$tool" "$target" "$url" 200 "$file_rel" "$(size_of "$file")" true
      echo "(already fetched in this run, using the saved copy)"
      return
    fi
  fi
  name=$(printf '%02d-%s.%s' "$(($(count_calls) + 1))" "$tool" "$ext")
  file="$raw/$name"
  file_rel="raw/$name"
  code=$(get "$url" "$file")
  if [ "$code" != "200" ]; then
    log "$tool" "$target" "$url" "$((10#$code))" "" 0 false
    echo "no data: HTTP $code for $url"
    exit 2
  fi
  log "$tool" "$target" "$url" 200 "$file_rel" "$(size_of "$file")" false
}

cik_arg() {
  [[ "${1:-}" =~ ^[0-9]{1,10}$ ]] || die "cik must be digits; get it with lookup"
  cik_int=$((10#$1))
  cik10=$(printf '%010d' "$cik_int")
}

footer() { echo "saved: $file  |  steps used: $(count_steps)/$MAX_STEPS"; }

cmd_lookup() {
  local q="${1:-}" tickers="$raw/company_tickers.json" out code
  [[ "$q" =~ ^[A-Za-z0-9][A-Za-z0-9\ .\&-]{0,59}$ ]] || die "lookup takes a ticker or company name"
  local url=https://www.sec.gov/files/company_tickers.json
  guard lookup "$q"
  if [ ! -f "$tickers" ]; then
    code=$(get "$url" "$tickers")
    if [ "$code" != "200" ]; then
      log lookup "$q" "$url" "$((10#$code))" "" 0 false
      echo "no data: HTTP $code for $url"
      exit 2
    fi
    log lookup "$q" "$url" 200 raw/company_tickers.json "$(size_of "$tickers")" false
  else
    log lookup "$q" "$url" 200 raw/company_tickers.json "$(size_of "$tickers")" true
  fi
  file=$tickers
  out=$(LC_ALL=C tr '{' '\n' <"$tickers" | LC_ALL=C awk -F'"' -v q="$q" '
    BEGIN { Q = toupper(q) }
    $4 != "ticker" { next }
    { cik = $3; gsub(/[^0-9]/, "", cik); row = cik "\t" $6 "\t" $10 }
    toupper($6) == Q { exact = exact row "\n"; next }
    index(toupper($10), Q) > 0 && n < 10 { near = near row "\n"; n++ }
    END { printf "%s", (exact != "" ? exact : near) }')
  if [ -z "$out" ]; then
    echo "no match for \"$q\" among SEC-registered tickers. It may not be listed in the US."
  else
    printf 'cik\tticker\tname\n%s\n' "$out"
  fi
  footer
}

cmd_concept() {
  cik_arg "${1:-}"
  local tag="${2:-}" period="${3:-annual}" forms lo hi keep
  [[ "$tag" =~ ^[a-z0-9-]+/[A-Za-z0-9_]+$ ]] || die "concept takes a tag like us-gaap/GrossProfit"
  case "$period" in
    annual) forms='^(10-K|20-F|40-F)(/A)?$'; lo=350; hi=380; keep=8 ;;
    quarterly) forms='^10-Q(/A)?$'; lo=80; hi=100; keep=12 ;;
    *) die "period must be annual or quarterly" ;;
  esac
  fetch concept "$cik10 $tag $period" "https://data.sec.gov/api/xbrl/companyconcept/CIK$cik10/$tag.json" json
  LC_ALL=C tr '{' '\n' <"$file" | LC_ALL=C awk -v forms="$forms" -v lo="$lo" -v hi="$hi" -v period="$period" '
    function field(name, m) {
      if (!match($0, "\"" name "\":\"?[^,\"}]*")) return ""
      m = substr($0, RSTART, RLENGTH)
      sub(/^"[^"]*":"?/, "", m)
      return m
    }
    function days(d, p) { split(d, p, "-"); return p[1] * 365 + p[2] * 30 + p[3] }
    /"entityName":/ { print "company: " field("entityName"); print "label: " field("label") }
    /"val":/ {
      form = field("form"); start = field("start"); end = field("end"); filed = field("filed")
      if (form ~ forms && (period != "annual" || field("fp") == "FY")) {
        span = start == "" ? 0 : days(end) - days(start)
        if (start == "" || (span >= lo && span <= hi)) {
          key = start "|" end "|" unit
          if (!(key in best) || filed >= best[key]) {
            best[key] = filed
            row[key] = end "\t" (start == "" ? "-" : start) "\t" field("val") "\t" unit "\t" form "\t" filed "\t" field("accn")
          }
        }
      }
    }
    match($0, /"[^"]*":\[$/) { unit = substr($0, RSTART + 1, RLENGTH - 4) }
    END { for (k in row) print "ROW\t" row[k] }' >"$file.view"
  grep -v '^ROW' "$file.view"
  printf 'period_end\tperiod_start\tvalue\tunit\tform\tfiled\taccession\n'
  grep '^ROW' "$file.view" | cut -f2- | sort | tail -n "$keep"
  rm -f "$file.view"
  footer
}

column_of() {
  grep -o "\"$1\":\[[^]]*\]" "$2" | head -n 1 | sed "s/^\"$1\":\[//; s/\]\$//" | tr ',' '\n' | tr -d '"'
}

cmd_filings() {
  cik_arg "${1:-}"
  local form="${2:-}" count="${3:-5}" tmp
  [[ "$form" =~ ^[A-Za-z0-9\ /-]{0,12}$ ]] || die "form looks wrong; try 10-K, 10-Q, 8-K, 4"
  [[ "$count" =~ ^[0-9]{1,2}$ ]] && [ "$count" -ge 1 ] || die "count must be 1-20"
  [ "$count" -le 20 ] || count=20
  fetch filings "$cik10 ${form:-any} $count" "https://data.sec.gov/submissions/CIK$cik10.json" json
  tmp="$file.cols"
  mkdir -p "$tmp" || die "cannot create $tmp"
  for c in filingDate form reportDate accessionNumber primaryDocument; do column_of "$c" "$file" >"$tmp/$c"; done
  printf 'filed\tform\treport_date\turl\n'
  paste "$tmp/filingDate" "$tmp/form" "$tmp/reportDate" "$tmp/accessionNumber" "$tmp/primaryDocument" |
    LC_ALL=C awk -F'\t' -v want="$form" -v n="$count" -v cik="$cik_int" '
      want != "" && $2 != want { next }
      seen >= n { next }
      { seen++; a = $4; gsub(/-/, "", a); printf "%s\t%s\t%s\thttps://www.sec.gov/Archives/edgar/data/%s/%s/%s\n", $1, $2, $3, cik, a, $5 }'
  rm -f "$tmp"/*
  rmdir "$tmp"
  footer
}

cmd_read() {
  local url="${1:-}" text
  [[ "$url" =~ ^https://(www|data)\.sec\.gov/[A-Za-z0-9._/~-]+$ ]] || die "read only opens www.sec.gov and data.sec.gov documents"
  fetch read "$url" "$url" htm
  text="$file.txt"
  LC_ALL=C tr '\r\n' '  ' <"$file" | LC_ALL=C awk '{
      gsub(/<ix:header>.*<\/ix:header>/, " ")
      gsub(/<\/(div|p|tr|table|li|title|h[1-6])>/, "&\n")
      gsub(/<br[^>]*>/, "\n")
      gsub(/<[^>]*>/, " ")
      gsub(/&#160;|&nbsp;|&#xa0;/, " ")
      gsub(/&#8217;|&#8216;|&#39;|&rsquo;|&lsquo;/, "\047")
      gsub(/&#8220;|&#8221;|&quot;|&ldquo;|&rdquo;/, "\"")
      gsub(/&#8211;|&#8212;|&ndash;|&mdash;/, "-")
      gsub(/&lt;/, "<"); gsub(/&gt;/, ">"); gsub(/&amp;/, "\\&")
      print }' | LC_ALL=C sed 's/[[:space:]][[:space:]]*/ /g; s/^ //; s/ $//' | grep -v '^$' >"$text"
  echo "text: $text ($(wc -l <"$text" | tr -d ' ') lines)"
  echo "sections (line number: heading):"
  LC_ALL=C grep -n -i -E '^(part +[ivx]+|item +[0-9]+[abc]?[.: ])' "$text" | cut -c1-110 | head -n 60
  echo "read a section with: sed -n 'START,ENDp' \"$text\""
  footer
}

cmd_note() {
  local tool="${1:-}" body="${2:-}"
  [[ "$tool" =~ ^[a-z_-]{1,30}$ ]] || die "note takes a tool name such as web_search"
  [ -n "$body" ] || die "note takes a short description"
  body=$(printf '%s' "$body" | tr -d '"\\' | tr '\r\n\t' '   ')
  body=${body:0:200}
  printf '{"ts":"%s","tool":"%s","target":"%s","note":true}\n' "$(now)" "$tool" "$body" >>"$trace"
  echo "noted"
}

case "$cmd" in
  lookup) cmd_lookup "$@" ;;
  concept) cmd_concept "$@" ;;
  filings) cmd_filings "$@" ;;
  read) cmd_read "$@" ;;
  note) cmd_note "$@" ;;
  *) die "unknown command: $cmd" ;;
esac
