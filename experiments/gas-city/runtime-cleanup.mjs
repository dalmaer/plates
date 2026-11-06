// Signal every owned process before awaiting any of them. One failed cleanup
// must never prevent another process from receiving its shutdown request.
export async function cleanupRuntime({children,driver,driverExit,readReceipt,bounded}) {
 const errors=[];let cleanup=null;
 for(const child of children.keys())try {child.kill('SIGKILL');}catch(error){errors.push(`coordinator signal: ${error.message}`);}
 try {driver.kill('SIGTERM');}catch(error){errors.push(`driver signal: ${error.message}`);}
 const [coordinators,provider]=await Promise.allSettled([
  bounded(Promise.all([...children.values()]),'owned coordinator cleanup'),
  bounded(driverExit,'driver teardown'),
 ]);
 if(coordinators.status==='rejected')errors.push(`coordinator exit: ${coordinators.reason.message}`);
 if(provider.status==='rejected')errors.push(`driver exit: ${provider.reason.message}`);
 else {
  const [code,signal]=provider.value;
  if(code!==0)errors.push(`driver exit: ${code}, signal: ${signal}`);
  try {
   cleanup=await bounded(readReceipt(),'cleanup receipt');
   const observation=cleanup?.observation;
   if(cleanup?.cleanup!==true||observation?.running!==false||!(observation?.creates===0||observation?.exitConfirmed===true))errors.push('driver exit proof unavailable');
  }catch(error){errors.push(`driver receipt: ${error.message}`);}
 }
 return {errors,cleanup};
}
