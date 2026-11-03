// Serialize in the renderer, before native web objects cross contextBridge.
export async function serializeBody(body) {
  if (body == null) return undefined;
  if (body instanceof FormData) {
    const entries=[];
    for (const [name,value] of body.entries()) {
      entries.push({name,value:value instanceof Blob
        ? {kind:'blob',type:value.type,filename:value.name||'upload.bin',bytes:new Uint8Array(await value.arrayBuffer())}
        : String(value)});
    }
    return {kind:'form-data',entries};
  }
  if (body instanceof URLSearchParams) return {kind:'url-search-params',value:[...body.entries()]};
  if (body instanceof Blob) return {kind:'bytes',bytes:new Uint8Array(await body.arrayBuffer())};
  if (body instanceof ArrayBuffer) return {kind:'bytes',bytes:new Uint8Array(body)};
  if (ArrayBuffer.isView(body)) return {kind:'bytes',bytes:new Uint8Array(body.buffer,body.byteOffset,body.byteLength)};
  return {kind:'text',value:String(body)};
}
