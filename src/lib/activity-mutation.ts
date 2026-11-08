// A list reload failure cannot undo a write already acknowledged by the server.
export async function commitThenRefresh<T>(write:()=>Promise<T>,refresh:()=>Promise<unknown>){
 const data=await write();
 try{await refresh();return {data,synchronized:true};}
 catch{return {data,synchronized:false};}
}
