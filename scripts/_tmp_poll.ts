import { prisma } from "@/lib/prisma";
async function main(){
  const mid="cmrvphw8e0003p6w29z3f0jrt";
  for (let i=0;i<24;i++){
    const m=await prisma.match.findUnique({where:{id:mid}});
    const inv=await prisma.matchInvite.findFirst({where:{matchId:mid}});
    if (m && (m.aDecision!=="pending" || inv?.decidedAt)) { console.log("RESULT aDecision="+m.aDecision+" stage="+m.stage+" decidedAt="+(!!inv?.decidedAt)+" after ~"+(i*5)+"s"); process.exit(0); }
    await new Promise(r=>setTimeout(r,5000));
  }
  const m=await prisma.match.findUnique({where:{id:mid}});
  console.log("RESULT TIMEOUT aDecision="+m?.aDecision+" (no decision recorded in 120s)");
}
main().then(()=>process.exit(0));
