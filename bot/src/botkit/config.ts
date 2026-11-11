/**
 * 目录的地址和签名公钥（私钥只在发布机器上）。
 * AMB_CATALOG=off 时不联网，目录就是空的，App 的行为和没有这个功能时一样：测试和不想要目录的部署用它。
 * 开发时用环境变量 AMB_CATALOG_URL、AMB_CATALOG_PUBKEY 覆盖。
 */
export const CATALOG_URL = "";
export const CATALOG_PUBLIC_KEY = "";

export function catalogConfig(env: NodeJS.ProcessEnv = process.env): { url: string; publicKey: string } {
  if (env.AMB_CATALOG === "off") return { url: "", publicKey: "" };
  return { url: env.AMB_CATALOG_URL || CATALOG_URL, publicKey: env.AMB_CATALOG_PUBKEY || CATALOG_PUBLIC_KEY };
}
