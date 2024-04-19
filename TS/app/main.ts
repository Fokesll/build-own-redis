import * as net from "node:net";
import * as util from './util.ts'


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
