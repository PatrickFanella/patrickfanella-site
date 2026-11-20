// Builds PostgreSQL protocol frames by hand for the decoder and capture tests.
export const bytes = (text: string) => [...new TextEncoder().encode(text), 0]
export const int16 = (n: number) => [n >>> 8 & 255, n & 255]
export const int32 = (n: number) => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255]
export const frame = (type: string, body: number[]) => [type.charCodeAt(0), ...int32(body.length + 4), ...body]
