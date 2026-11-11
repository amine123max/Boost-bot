export function boostConfigToml(endpoint: string, model: string) {
  return [
    `model_provider = "Boost"`,
    `model = ${JSON.stringify(model || "填入模型 ID")}`,
    "",
    "[model_providers.Boost]",
    'name = "Boost"',
    `base_url = ${JSON.stringify(endpoint)}`,
    'wire_api = "responses"',
    'env_key = "BOOST_API_KEY"',
    "requires_openai_auth = false",
  ].join("\n");
}

export function boostKeyCommand(shell: "powershell" | "bash", key: string) {
  const value = key || "平台密钥";
  return shell === "powershell"
    ? `$env:BOOST_API_KEY = '${value.replace(/'/g, "''")}'`
    : `export BOOST_API_KEY='${value.replace(/'/g, "'\\''")}'`;
}
