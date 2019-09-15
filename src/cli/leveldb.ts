import encode from "encoding-down";
import leveldown from "leveldown";
import levelup from "levelup";
import { QuadStore } from "quadstore";

export function getLevelDB(name: string) {
  const options = {};

  return levelup(encode(leveldown(`databases/${name}`), options), options);
}

export function getQuadStore() {
  const options = {};

  return new QuadStore(leveldown("databases/rdf"), options);
}
