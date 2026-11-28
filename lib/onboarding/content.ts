import { paymentPeso } from "@/lib/payment-format";

export type Language = "en" | "ceb";
export const languages = { en: "English", ceb: "Bisaya" } as const;

export function creditSteps(language: Language, minimum: number | null, rate: number) {
  const percent = rate.toLocaleString("en-PH", { maximumFractionDigits: 4 });
  return language === "en" ? [
    `Each confirmed booking uses ${percent}% of its price as the platform fee.`,
    "The fee is held while a booking waits for confirmation.",
    minimum === null ? "Check Credits for the minimum balance needed to list vehicles." : `Keep at least ${paymentPeso(minimum)} so your vehicles stay listed.`,
  ] : [
    `Sa matag kumpirmadong booking, ${percent}% sa presyo ang bayad sa plataporma.`,
    "Ireserba ang bayad samtang naghulat og kumpirmasyon ang booking.",
    minimum === null ? "Tan-awa sa Credits ang minimum nga balanse para malista ang mga sakyanan." : `Pagbilin og labing menos ${paymentPeso(minimum)} aron magpabiling nakalista ang imong mga sakyanan.`,
  ];
}

export const onboardingCopy = {
  en: {
    title: "Finish setting up", intro: "Takes about 10 minutes. You can stop and come back.",
    count: (n: number) => `${n} of 5 done`, hide: "Hide for now", ready: "You’re ready for bookings",
    vehicles: "View my vehicles", dismiss: "Dismiss", start: "Start", open: "Open", loading: "Loading setup checklist",
    review: "Sent for review. We’ll notify you.", done: "Done",
    unavailable: "Your vehicles aren’t visible for bookings yet. Check your vehicle visibility and payment status.",
    rows: ["Get approved as a partner", "Add your payment QR", "Add your first vehicle", "Top up starting credits", "Learn to confirm a deposit"],
    help: "Help and guides", sidebarHelp: "Help", helpIntro: "Short guides for owners.", replay: "Replay the quick tour",
    minute: (n: number) => `${n} min`, important: "Important", language: "Language",
    skip: "Skip", back: "Back", next: "Next", setup: "Start setup",
    progress: (n: number) => `Step ${n} of 4`, deadline: (hours: number) => `${hours} hours to review`,
    tourTitles: ["How a booking works", "Pay the platform fee", "Pickup pass and ID check", "Confirm before the deadline"],
    tourFlow: ["Customer requests dates", "Customer pays the deposit", "You check proof and confirm"],
    invoice: "Pay your platform fees when your invoice is due.",
    credits: (amount: string) => `Confirmed bookings use credits for the platform fee. Keep at least ${amount} available.`,
    creditsFallback: "Confirmed bookings use credits for the platform fee. Check Credits for your minimum balance.",
    pickup: "Ask for the pickup pass and a valid ID. Scan the QR and check the booking before handing over the vehicle.",
    confirm: "Open Deposits to check the proof. Use the deadline shown on each booking to finish your review in time.",
    guides: [
      { title: "How a booking works", steps: ["Open Bookings to see the requested dates.", "Wait for the customer to send deposit proof.", "Check the proof and confirm the booking."] },
      { title: "Confirm a deposit", steps: ["Open Deposits and select the booking.", "Match the amount and reference to the transfer you received.", "Confirm the booking before its review deadline."] },
      { title: "Scan the pickup pass", steps: ["Ask the customer for their pass and a valid ID.", "Open Scan pickup pass and scan the QR, or enter the backup code.", "Check the booking and mark the vehicle as picked up."] },
      { title: "How credits work", steps: [] },
      { title: "Add or edit a vehicle", steps: ["Open My vehicles and add a vehicle or select one to edit.", "Upload at least three photos and set a rental rate.", "Save and check the vehicle’s listing visibility."] },
      { title: "Contact support", steps: ["Find the booking reference or vehicle name.", "Describe what happened and what help you need.", "Send your message to our support inbox."] },
    ],
    customerTitle: "Book in 3 steps", customerSteps: ["Pick your dates", "Pay the deposit", "Show your pass"],
    payTitle: "Pay, then upload your proof.", payTip: "The owner checks it and confirms. Your dates are held until then.",
    passTitle: "Show this at pickup.", passTip: "Show this QR with a valid ID. The owner scans it to hand over the vehicle.",
    gotIt: "Got it", disable: "Don’t show tips",
  },
  ceb: {
    title: "Humana ang pag-set up", intro: "Mga 10 minutos ra. Pwede ka mohunong ug mobalik.",
    count: (n: number) => `${n} sa 5 ang nahuman`, hide: "Itago sa karon", ready: "Andam na ka sa pagdawat og booking",
    vehicles: "Tan-awa akong mga sakyanan", dismiss: "Isira", start: "Sugdi", open: "Ablihi", loading: "Nagkarga ang checklist",
    review: "Gisumite na para susihon. Pahibaw-on ka namo.", done: "Nahuman",
    unavailable: "Dili pa makita sa mga customer ang imong mga sakyanan. Susiha ang ilang visibility ug ang status sa bayad.",
    rows: ["Maaprobahan isip partner", "Idugang ang imong QR sa bayad", "Idugang ang unang sakyanan", "Pag-top up sa unang credits", "Pagkat-on sa pagkumpirma sa deposito"],
    help: "Tabang ug mga giya", sidebarHelp: "Tabang", helpIntro: "Mubong giya para sa mga tag-iya.", replay: "Balika ang mubo nga tour",
    minute: (n: number) => `${n} min`, important: "Importante", language: "Pinulongan",
    skip: "Laktawi", back: "Balik", next: "Sunod", setup: "Sugdi ang pag-set up",
    progress: (n: number) => `Lakang ${n} sa 4`, deadline: (hours: number) => `${hours} ka oras sa pagsusi`,
    tourTitles: ["Giunsa ang booking", "Bayri ang plataporma", "Pickup pass ug pagsusi sa ID", "Kumpirmaha sa dili pa ang deadline"],
    tourFlow: ["Mangayo og petsa ang customer", "Mobayad og deposito ang customer", "Susiha ang resibo ug kumpirmaha"],
    invoice: "Bayri ang plataporma sa dili pa matapos ang takdang petsa sa invoice.",
    credits: (amount: string) => `Gigamit ang credits sa bayad sa plataporma sa matag kumpirmadong booking. Pagbilin og labing menos ${amount}.`,
    creditsFallback: "Gigamit ang credits sa bayad sa plataporma sa matag kumpirmadong booking. Tan-awa ang minimum sa Credits.",
    pickup: "Pangayoa ang pickup pass ug balidong ID. I-scan ang QR ug susiha ang booking sa dili pa itugyan ang sakyanan.",
    confirm: "Ablihi ang Deposits ug susiha ang resibo. Sunda ang deadline sa matag booking aron mahuman ang pagsusi sa oras.",
    guides: [
      { title: "Giunsa ang booking", steps: ["Ablihi ang Bookings aron makita ang gipiling mga petsa.", "Hulata ang resibo sa deposito gikan sa customer.", "Susiha ang resibo ug kumpirmaha ang booking."] },
      { title: "Kumpirmaha ang deposito", steps: ["Ablihi ang Deposits ug pilia ang booking.", "Itandi ang kantidad ug reference sa bayad nga imong nadawat.", "Kumpirmaha ang booking sa dili pa ang deadline sa pagsusi."] },
      { title: "I-scan ang pickup pass", steps: ["Pangayoa ang pass ug balidong ID sa customer.", "Ablihi ang Scan pickup pass ug i-scan ang QR o isulod ang backup code.", "Susiha ang booking ug markahi nga nakuha na ang sakyanan."] },
      { title: "Giunsa ang credits", steps: [] },
      { title: "Pagdugang o pag-usab og sakyanan", steps: ["Ablihi ang My vehicles ug pagdugang o pagpili og sakyanan.", "Pag-upload og labing menos tulo ka litrato ug pagbutang og presyo sa abang.", "I-save ug susiha kon makita ba ang listing."] },
      { title: "Kontaka ang support", steps: ["Pangitaa ang booking reference o ngalan sa sakyanan.", "Isaysay ang nahitabo ug unsang tabang ang imong gikinahanglan.", "Ipadala ang imong mensahe sa among support email."] },
    ],
    customerTitle: "Pag-book sa 3 ka lakang", customerSteps: ["Pilia ang mga petsa", "Bayri ang deposito", "Ipakita ang imong pass"],
    payTitle: "Bayad una, dayon i-upload ang resibo.", payTip: "Susiha ug kumpirmahon kini sa tag-iya. Gigahin ang mga petsa para nimo hangtod makumpirma.",
    passTitle: "Ipakita kini sa pickup.", passTip: "Ipakita kining QR uban sa balidong ID. I-scan kini sa tag-iya aron itugyan ang sakyanan.",
    gotIt: "Sige", disable: "Ayaw ipakita ang mga tip",
  },
};
