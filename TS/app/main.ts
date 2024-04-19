import * as net from "node:net";
import * as util from './util.ts'


type KeyValueStore = {
    [key: string]: {
        value: string;
        expiration?: Date;
    }
};

const kvStore: KeyValueStore = {};

const CR = '\r';
const LF = '\n';
const CRLF = '\r\n';

const ClientTimeout = 3000;
const ServerTimeout = 3000;

const server: net.Server = net.createServer();

server.on("connection", (connection: net.Socket) => {

    console.log("DEBUG: connected");

    connection.on("close", () => {
        console.log("DEBUG: disconnected");
        connection.end();
    });

    connection.on("data", (data) => {
        console.log("DEBUG! received data:", data);

        const cmd = util.decodeResp(data.toString());

        console.log("DEBUG! cmd:", cmd)

        switch (cmd[0].toUpperCase()) {
            case "PING":
                connection.write(util.encodeSimple("PONG"));
                break;
            case "ECHO":
                connection.write(util.encodeBulk(cmd[1]));
                break;

            case "SET":
                kvStore[cmd[1]] = { value: cmd[2] };
                if (cmd.length === 5 && cmd[3].toUpperCase() === 'PX') {
                    const durationInMs = parseInt(cmd[4], 10);
                    const time = new Date();
                    time.setMilliseconds(time.getMilliseconds() + durationInMs);
                    kvStore[cmd[1]].expiration = time;
                }
                connection.write(util.encodeSimple("OK"));
                break;

            case "GET":
                if (Object.hasOwn(kvStore, cmd[1])) {
                    const entry = kvStore[cmd[1]];
                    const now = new Date();
                    if ((entry.expiration ?? now) < now) {
                        delete kvStore[cmd[1]];
                        connection.write(util.encodeNull());
                    }
                    else {
                        connection.write(util.encodeBulk(entry.value));
                    }
                } else {
                    connection.write(util.encodeNull());
                }
        }






    });
    setTimeout(() => connection.end(), ClientTimeout);
});

server.on("error", (err) => {
    throw err;
});

server.listen(6379, "127.0.0.1", () => {
    console.log("listening connect");
});

setTimeout(() => server.close(), ServerTimeout)
