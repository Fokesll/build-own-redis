export function decodeResp(s: string): string[] {
    const result = [];
    const parts = s.split("\r\n");
    const arrSize = parseInt(parts[0].replace("*", ""), 10);
    //console.log("arrSize:", arrSize);
    for (let i = 0; i < arrSize; i++) {
        const strSize = parseInt(parts[i * 2 + 1].replace("$", ""), 10);
        const str = parts[i * 2 + 2];
        //console.log("str:", strSize, str.length, str);
        result.push(str);
    }
    return result;
}
export function encodeSimple(s: string): string {
    return `+${s}\r\n`;
}
export function encodeBulk(s: string): string {
    return `\$${s.length}\r\n${s}\r\n`;
}