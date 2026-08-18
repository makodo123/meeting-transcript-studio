import { Converter } from "opencc-js";

let converter: ((text: string) => string) | null = null;

/** 把簡體中文轉成台灣繁體用語（例如「軟件」→「軟體」）。*/
export function toTraditionalTaiwan(text: string): string {
  if (!converter) {
    converter = Converter({ from: "cn", to: "twp" });
  }
  return converter(text);
}
