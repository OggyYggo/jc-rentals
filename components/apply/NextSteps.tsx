import { CarFront, FileText, Mail, Send } from "lucide-react";
const items = [
  [Send, "Send your application", "Fill in the form. No account needed."],
  [FileText, "We review it", "We check your photos and documents, and may call you."],
  [CarFront, "Set up your account", "Approved? You get an email to set your password and start earning."],
] as const;
export function NextSteps() { return <ol className="mt-5 space-y-5">{items.map(([Icon, title, text], index) => <li key={title} className="relative flex gap-3"><span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EAF4FF] text-[#0B63CE]">{index === 2 ? <Mail size={16}/> : <Icon size={16}/>}</span><div><h3 className="text-sm font-semibold text-[#0F2342]">{title}</h3><p className="mt-1 text-xs leading-5 text-[#51657F]">{text}</p></div></li>)}</ol>; }
