import * as net from "node:net";
import * as util from './util.ts'


type KeyValueStore = {
    [key: string]: string;
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
        switch (cmd[0].toUpperCase()) {
            case "PING":
                connection.write(util.encodeSimple("PONG"));
                break;
            case "ECHO":
                connection.write(util.encodeBulk(cmd[1]));
                break;

            case "SET":
                kvStore[cmd[1]] = cmd[2];
                connection.write(util.encodeSimple("OK"));
                break;

            case "GET":
                if (Object.hasOwn(kvStore, cmd[1])) {
                    connection.write(util.encodeBulk(kvStore[cmd[1]]));

                } else {
                    connection.write(util.encodeNull());
                }
                break;
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
