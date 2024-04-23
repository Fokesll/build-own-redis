import { iterateReader } from "@std/io/iterate-reader";
import * as concepts from './concepts.ts'
import * as utils from './util.ts'



async function main() {
    const cfg: concepts.ServerConfig = {
        dir: "",
        dbfilename: "",
        port: 6379,
        role: "master",
        replicaOfHost: "",
        replicaOfPort: 0,
        replid: utils.genReplid(),
        offset: 0,
    };

    for (let i = 0; i < Deno.args.length; i++) {

        switch (Deno.args[i]) {

            case "--dir":
                cfg.dir = Deno.args[i + 1];
                i++;
                break;
            case "--dbfilename":
                cfg.dbfilename = Deno.args[i + 1];
                i++;
                break;
            case "--port":
                cfg.port = parseInt(Deno.args[i + 1], 10);
                break;
            case "--replicaof":
                cfg.role = "slave";
                cfg.replicaOfHost = Deno.args[i + 1];
                cfg.replicaOfPort = parseInt(Deno.args[i + 2], 10);
                break;

        }

    }

    const kvStore = utils.loadRdb(cfg)

    await replicaHandshake(cfg, kvStore);

    const listener = Deno.listen({
        hostname: "127.0.0.1",
        port: cfg.port,
        transport: "tcp",
    });

    for await (const connection of listener) {
        handleConnection(connection, cfg, kvStore);
    }

}


async function handleConnection(
    connection: Deno.TcpConn,
    cfg: concepts.ServerConfig,
    KvStore: concepts.KeyValueStore
) {
    console.log("DEBUG! connected");

    for await (const data of iterateReader(connection)) {

        const cmd = utils.decodeResp(data);

        console.log("🚀 ~ forawait ~ cmd:", cmd)

        switch (cmd[0].toUpperCase()) {

            case "PING":
                await connection.write(utils.encodeSimple("PONG"));
                break;

            case "ECHO":
                await connection.write(utils.encodeBulk(cmd[1]));
                break;

            case "SET":
                KvStore[cmd[1]] = { value: cmd[2] };
                if (cmd.length === 5 && cmd[3].toUpperCase() === "PX") {
                    const durationInMs = parseInt(cmd[4], 10);
                    const time = new Date();
                    time.setMilliseconds(time.getMilliseconds() + durationInMs);
                    KvStore[cmd[1]].expiration = time;
                }
                await connection.write(utils.encodeSimple("OK"));
                break;

            case "GET":
                if (Object.hasOwn(KvStore, cmd[1])) {
                    const entry = KvStore[cmd[1]];
                    const now = new Date();

                    if ((entry.expiration ?? now) < now) {
                        delete KvStore[cmd[1]];
                        await connection.write(utils.encodeNull());
                    } else {
                        await connection.write(utils.encodeBulk(entry.value));
                    }

                } else {
                    await connection.write(utils.encodeNull());
                }
                break;


            case "KEYS":
                await connection.write(utils.encodeArray(Object.keys(KvStore)));
                break;

            case "CONFIG":

                if (cmd.length == 3 && cmd[1].toUpperCase() === "GET") {
                    switch (cmd[2].toLowerCase()) {
                        case "dir":
                            await connection.write(utils.encodeArray(["dir", cfg.dir]));
                            break;

                        case "dbfilename":
                            await connection.write(utils.encodeArray(["dbfilename", cfg.dbfilename]),);
                            break;

                        default:
                            await connection.write(utils.encodeError("not found"));
                            break;
                    }
                } else {
                    await connection.write(utils.encodeError("action not implemented"));
                }
                break;

            case "INFO":
                await connection.write(utils.encodeBulk(
                    `role:${cfg.role}\r\nmaster_replid:${cfg.replid}\r\nmaster_repl_offset:${cfg.offset}`,
                ),
                );
                break;

            default:
                await connection.write(utils.encodeError("command not implemented"));

        }


    }


    console.log("DEBUG! disconnected");
}


async function replicaHandshake(cfg: concepts.ServerConfig, kvStore: concepts.KeyValueStore) {

    console.log("DEBUG! cfg", cfg)

    if (cfg.role === "master") {
        return;
    }

    const connection = await Deno.connect({
        hostname: cfg.replicaOfHost,
        port: cfg.replicaOfPort,
        transport: "tcp",
    });

    const buffer = new Uint8Array(1024);
    await connection.write(utils.encodeArray(["ping"]));
    await connection.read(buffer);

    await connection.write(utils.encodeArray(["replconf", "listening-port", cfg.port.toString()]));
    await connection.read(buffer);
    
    await connection.write(utils.encodeArray(["replconf", "capa", "psync2"]));
    await connection.read(buffer);

    await connection.write(utils.encodeArray(["psync", "?", "-1"]));
    await connection.read(buffer);

}

main();


//