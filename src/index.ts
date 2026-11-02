import { readConfig, setUser } from "./config.js";

function main() {
  const config = readConfig();

  setUser(config, "Carlos");

  const updatedConfig = readConfig();

  console.log(updatedConfig);
}

main();