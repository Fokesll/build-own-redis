import * as concepts from './concepts.ts'
import * as stdPath from "jsr:@std/path"

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const strToBytes = encoder.encode.bind(encoder);
const bytesToStr = decoder.decode.bind(decoder);



export class RDBParser {
  path: string;
  data: Uint8Array;
  index: number = 0;
  entries: concepts.KeyValueStore = {};

  constructor(path: string) {
    this.path = path;

    try {
      this.data = Deno.readFileSync(this.path);
    } catch (err) {
      console.log(`DEBUG! skipped reading DBfile: ${this.path}`);
      console.log(err);
      this.data = new Uint8Array();
      return;
    }
  }

  parse() {
    if (this.data === undefined) {
      return;
    }

    const header = bytesToStr(this.data.slice(0, 5));
    if (header !== "REDIS") {
      console.log(`DEBUG! not a RedisDB file: ${this.path}`);
      return;
    }

    const version = bytesToStr(this.data.slice(5, 9));
    console.log("🚀 ~ RDBparser ~ parse ~ version:", version)

    this.index = 9;

    let EOF = false;

    while (!EOF && this.index < this.data.length) {
      const opreation = this.data[this.index++];

      switch (opreation) {
        case 0xFA: {
          const key = this.readEncodedString();
          switch (key) {
            case "redis-ver":
              console.log(key, this.readEncodedString());
              break;
            case "redis-bits":
              console.log(key, this.readEncodedInt());
              break;
            case "ctime":
              console.log(key, new Date(this.readEncodedInt() * 1000));
              break;
            case "used-mem":
              console.log(key, this.readEncodedInt());
              break;
            case "aof-preamble":
              console.log(key, this.readEncodedInt());
              break;
            default:
              throw Error("unknown auxiliary field");
          }
          break;
        }

        case 0xFB:
          console.log("keyspace", this.readEncodedInt());
          console.log("expires", this.readEncodedInt());
          this.readEntries();
          break;

        case 0xFE:
          console.log("db selector", this.readEncodedInt());
          break;

        case 0xFF:
          EOF = true;
          break;

        default:
          throw Error("op not implemented: " + op);
      }


      if (EOF) {
        break;
      }


    }
  }

  readEntries() {
    const now = new Date();
    while (this.index < this.data.length) {
      let type = this.data[this.index++];
      let expiration: Date | undefined;

      if (type === 0xFF) {
        this.index--;
        break;
      } else if (type === 0xFC) { // Expire time in milliseconds
        const milliseconds = this.readUint64();
        expiration = new Date(Number(milliseconds));
        type = this.data[this.index++];
      } else if (type === 0xFD) { // Expire time in seconds
        const seconds = this.readUint32();
        expiration = new Date(seconds * 1000);
        type = this.data[this.index++];
      }

      const key = this.readEncodedString();
      switch (type) {
        case 0: { // string encoding
          const value = this.readEncodedString();
          console.log(key, value, expiration);
          if ((expiration ?? now) >= now) {
            this.entries[key] = { value, expiration };
          }
          break;
        }
        default:
          throw Error("type not implemented: " + type);
      }
    }
  }

  readUint32(): number {
    return (this.data[this.index++]) + (this.data[this.index++] << 8) +
      (this.data[this.index++] << 16) + (this.data[this.index++] << 24);
  }

  readUint64(): bigint {
    let result = BigInt(0);
    let shift = BigInt(0);
    for (let i = 0; i < 8; i++) {
      result += BigInt(this.data[this.index++]) << shift;
      shift += BigInt(8);
    }
    return result;
  }

  readEncodedInt(): number {
    let length = 0;
    const type = this.data[this.index] >> 6;
    switch (type) {
      case 0:
        length = this.data[this.index++];
        break;
      case 1:
        length = this.data[this.index++] & 0b00111111 |
          this.data[this.index++] << 6;
        break;
      case 2:
        this.index++;
        length = this.data[this.index++] << 24 | this.data[this.index++] << 16 |
          this.data[this.index++] << 8 | this.data[this.index++];
        break;
      case 3: {
        const bitType = this.data[this.index++] & 0b00111111;
        length = this.data[this.index++];
        if (bitType > 1) {
          length |= this.data[this.index++] << 8;
        }
        if (bitType == 2) {
          length |= this.data[this.index++] << 16 |
            this.data[this.index++] << 24;
        }
        if (bitType > 2) {
          throw Error("length not implemented");
        }
        break;
      }
    }
    return length;
  }

  readEncodedString(): string {
    const length = this.readEncodedInt();
    const str = bytesToStr(this.data.slice(this.index, this.index + length));
    this.index += length;
    return str;
  }

  getEntries(): concepts.KeyValueStore {
    return this.entries;
  }

}






export function loadRdb(cfg: concepts.ServerConfig): concepts.KeyValueStore {
  if (cfg.dbfilename === "") {
    return {};
  }

  const response = new RDBParser(stdPath.join(cfg.dir, cfg.dbfilename));
  response.parse();
  return response.getEntries();
}

export function decodeResp(data: Uint8Array): string[] {
  const result = [];
  const parts = bytesToStr(data).split("\r\n");
  const arrSize = parseInt(parts[0].replace("*", ""), 10);
  console.log("arrSize:", arrSize);
  console.log("parts", parts);
  for (let i = 0; i < arrSize; i++) {
    const strSize = parseInt(parts[i * 2 + 1].replace("$", ""), 10);
    const str = parts[i * 2 + 2];
    if (str.length != strSize) {
      throw Error("string size mismatch");
    }
    result.push(str);
  }
  return result;
}

export function encodeSimple(s: string): Uint8Array {
  return strToBytes(`+${s}\r\n`);
}

export function encodeBulk(s: string): Uint8Array {
  if (s.length === 0) {
    return encodeNull();
  }
  return strToBytes(`\$${s.length}\r\n${s}\r\n`);
}

export function encodeNull(): Uint8Array {
  return strToBytes(`$-1\r\n`);
}

export function encodeError(s: string): Uint8Array {
  return strToBytes(`-${s}\r\n`);
}

export function encodeArray(arr: string[]): Uint8Array {
  let result = `*${arr.length}\r\n`;
  for (const s of arr) {
    result += `\$${s.length}\r\n${s}\r\n`;
  }
  return strToBytes(result);
}

export function genReplid():string{
  const digits = "0123456789abcdef";
  const result = [];
  for(let i =0 ;i<40;i++){
    const digitIndex = Math.floor(Math.random()* digits.length);
    result.push(digits[digitIndex]);
  }
  return result.join("");
}