export type KeyValueStore = {
    [key: string]: {
        value: string;
        expiration?: Date;
    }
};

export type ServerConfig = {
    dir: string;
    dbfilename: string;
    port: number;
    role: string;
    replicaOfHost: string;
    replicaOfPort: number;
    replid:string;
    offset:number;
}