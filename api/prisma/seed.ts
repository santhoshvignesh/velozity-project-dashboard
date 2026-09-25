import { PrismaClient, Role, TaskStatus, Priority } from '@prisma/client';
import bcrypt from 'bcryptjs';
const db = new PrismaClient();
async function main() {
 await db.notification.deleteMany(); await db.activity.deleteMany(); await db.task.deleteMany(); await db.project.deleteMany(); await db.client.deleteMany(); await db.refreshToken.deleteMany(); await db.user.deleteMany();
 const hash = await bcrypt.hash('VelozityDemo2026!', 12);
 const admin=await db.user.create({data:{name:'Avery Admin',email:'admin@velozity.demo',passwordHash:hash,role:Role.ADMIN}});
 const pms=await Promise.all(['Morgan Lee','Jordan Patel'].map((name,i)=>db.user.create({data:{name,email:`pm${i+1}@velozity.demo`,passwordHash:hash,role:Role.PM}})));
 const devs=await Promise.all(['Ravi Kumar','Mia Chen','Noah Williams','Sofia Garcia'].map((name,i)=>db.user.create({data:{name,email:`dev${i+1}@velozity.demo`,passwordHash:hash,role:Role.DEVELOPER}})));
 const clients=await Promise.all(['Northstar Labs','Juniper Health','Atlas Commerce'].map(name=>db.client.create({data:{name}})));
 const statuses=[TaskStatus.TODO,TaskStatus.IN_PROGRESS,TaskStatus.IN_REVIEW,TaskStatus.DONE,TaskStatus.TODO,TaskStatus.IN_PROGRESS];
 for(let p=0;p<3;p++) { const project=await db.project.create({data:{name:['Northstar Client Portal','Juniper Care Platform','Atlas Storefront'][p],description:'A delivery project managed by the Velozity team.',clientId:clients[p].id,ownerId:p===0?admin.id:pms[(p-1)%2].id}});
  for(let t=0;t<6;t++) { const due=new Date(); due.setDate(due.getDate()+(t<2?-3:t+1)); const task=await db.task.create({data:{title:['Discovery and planning','Design system','API integration','Responsive dashboard','QA and accessibility','Production release'][t],description:'Deliver and review this milestone with the project team.',projectId:project.id,assigneeId:devs[(p+t)%4].id,status:t<2?TaskStatus.OVERDUE:statuses[(p+t)%statuses.length],priority:[Priority.HIGH,Priority.MEDIUM,Priority.CRITICAL,Priority.LOW][(p+t)%4],dueDate:due}});
   await db.activity.create({data:{projectId:project.id,taskId:task.id,userId:admin.id,event:'created',toStatus:task.status,createdAt:new Date(Date.now()-(t+2)*3600000)}});
   if(t===1) await db.notification.create({data:{userId:task.assigneeId!,title:'Task assigned',body:`You were assigned ${task.title}`}});
  }
 }
 console.log('Seeded demo users (password: VelozityDemo2026!) and 3 projects with 18 tasks.');
}
main().finally(()=>db.$disconnect());
