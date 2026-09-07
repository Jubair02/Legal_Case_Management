/**
 * Seed script for AinSheba — Legal Case Management (Bangladesh MVP)
 * Run: bun prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client"
import { hashPassword } from "../src/lib/password"
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"

const db = new PrismaClient()

const UPLOADS_ROOT = join(process.cwd(), "uploads")

/** Minimal valid PDF generator (single page, Helvetica). */
function makePdf(lines: string[]): Buffer {
  const content = lines
    .map((l, i) => {
      const text = l.replace(/[\\()]/g, "").slice(0, 90)
      const y = 740 - i * 22
      const size = i === 0 ? 15 : 11
      return `BT /F1 ${size} Tf 60 ${y} Td (${text}) Tj ET`
    })
    .join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.forEach((o) => {
    pdf += `${String(o).padStart(10, "0")} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return Buffer.from(pdf, "latin1")
}

/** Dhaka civil time helper: dayOffset 0 = today, hour in Dhaka local time. */
function dhakaAt(dayOffset: number, hour = 10): Date {
  const now = new Date()
  const base = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000)
  const y = base.getUTCFullYear()
  const m = String(base.getUTCMonth() + 1).padStart(2, "0")
  const d = String(base.getUTCDate()).padStart(2, "0")
  const utcHour = hour - 6 // Dhaka = UTC+6 (no DST)
  return new Date(`${y}-${m}-${d}T${String(utcHour).padStart(2, "0")}:00:00.000Z`)
}

function dateOnly(dayOffset: number): Date {
  return dhakaAt(dayOffset, 12)
}

async function main() {
  console.log("Seeding AinSheba database...")

  // ---- wipe in FK-safe order ----
  await db.notification.deleteMany()
  await db.payment.deleteMany()
  await db.invoice.deleteMany()
  await db.caseUpdate.deleteMany()
  await db.caseDocument.deleteMany()
  await db.hearing.deleteMany()
  await db.case.deleteMany()
  await db.client.deleteMany()
  await db.lawyer.deleteMany()
  await db.user.deleteMany()

  mkdirSync(UPLOADS_ROOT, { recursive: true })

  // ================= USERS =================
  const admin = await db.user.create({
    data: {
      name: "Arif Rahman",
      email: "admin@ainsheba.bd",
      phone: "+880 1711-000001",
      password: hashPassword("Admin@123"),
      role: "ADMIN",
    },
  })

  const lawyerUser1 = await db.user.create({
    data: {
      name: "Adv. Kamal Hossain",
      email: "kamal@ainsheba.bd",
      phone: "+880 1711-000002",
      password: hashPassword("Lawyer@123"),
      role: "LAWYER",
    },
  })
  const lawyerUser2 = await db.user.create({
    data: {
      name: "Adv. Nusrat Jahan",
      email: "nusrat@ainsheba.bd",
      phone: "+880 1711-000003",
      password: hashPassword("Lawyer@123"),
      role: "LAWYER",
    },
  })
  const lawyerUser3 = await db.user.create({
    data: {
      name: "Adv. Mahmudul Hasan",
      email: "mahmud@ainsheba.bd",
      phone: "+880 1711-000004",
      password: hashPassword("Lawyer@123"),
      role: "LAWYER",
    },
  })

  const staff = await db.user.create({
    data: {
      name: "Rafiq Islam",
      email: "staff@ainsheba.bd",
      phone: "+880 1711-000005",
      password: hashPassword("Staff@123"),
      role: "STAFF",
    },
  })

  const clientUser1 = await db.user.create({
    data: {
      name: "Abdul Karim",
      email: "client@ainsheba.bd",
      phone: "+880 1811-000010",
      password: hashPassword("Client@123"),
      role: "CLIENT",
    },
  })

  const lawyer1 = await db.lawyer.create({
    data: {
      userId: lawyerUser1.id,
      name: "Adv. Kamal Hossain",
      phone: "+880 1711-000002",
      email: "kamal@ainsheba.bd",
      barCouncilId: "BC-1998/D-1042",
      specialization: "Criminal Law",
      chamberName: "Hossain & Associates, Nazimuddin Road, Dhaka",
      experience: 25,
    },
  })
  const lawyer2 = await db.lawyer.create({
    data: {
      userId: lawyerUser2.id,
      name: "Adv. Nusrat Jahan",
      phone: "+880 1711-000003",
      email: "nusrat@ainsheba.bd",
      barCouncilId: "BC-2012/D-3187",
      specialization: "Family Law",
      chamberName: "Jahan Law Chamber, Uttara Sector-7, Dhaka",
      experience: 12,
    },
  })
  const lawyer3 = await db.lawyer.create({
    data: {
      userId: lawyerUser3.id,
      name: "Adv. Mahmudul Hasan",
      phone: "+880 1711-000004",
      email: "mahmud@ainsheba.bd",
      barCouncilId: "BC-2016/D-5210",
      specialization: "Land Law",
      chamberName: "Hasan Chamber, Old Court Building, Cumilla",
      experience: 8,
    },
  })

  const client1 = await db.client.create({
    data: {
      userId: clientUser1.id,
      name: "Abdul Karim",
      phone: "+880 1811-000010",
      email: "client@ainsheba.bd",
      nid: "1990123456789",
      address: "House 42, Road 7, Dhanmondi, Dhaka-1205",
      clientType: "INDIVIDUAL",
    },
  })
  const client2 = await db.client.create({
    data: {
      name: "Rahim Textiles Ltd.",
      phone: "+880 1911-000020",
      email: "legal@rahimtex.bd",
      nid: "TRAD/DNCC/009821",
      address: "Plot 15-20, BSCIC Industrial Area, Tongi, Gazipur",
      clientType: "COMPANY",
    },
  })
  const client3 = await db.client.create({
    data: {
      name: "Shirin Akter",
      phone: "+880 1611-000030",
      email: "shirin.akter@gmail.com",
      nid: "1995456789012",
      address: "Village: Boro Bazar, Post: Nangalkot, Cumilla",
      clientType: "INDIVIDUAL",
    },
  })
  const client4 = await db.client.create({
    data: {
      name: "Dhaka Traders (Pvt.) Ltd.",
      phone: "+880 1521-000040",
      email: "info@dhakatraders.bd",
      nid: "TRAD/Chattogram/114522",
      address: "78 Agrabad C/A, Chattogram",
      clientType: "ORGANIZATION",
    },
  })

  // ================= CASES =================
  const c1 = await db.case.create({
    data: {
      caseNumber: "CS-123/2026",
      title: "Karim vs. Rahman — Land Possession & Eviction Suit",
      type: "Land / Property Case",
      clientId: client1.id,
      lawyerId: lawyer3.id,
      court: "District & Sessions Judge Court",
      district: "Cumilla",
      filingDate: dateOnly(-45),
      status: "ACTIVE",
      priority: "HIGH",
      oppositeParty: "Mizanur Rahman & Sons",
      description:
        "Title dispute over 0.32 acre land at Mouza: Barura, Khatian No. 412. Defendants illegally occupied the suit land after altering boundary pillars. Seeking declaration of title, permanent injunction and eviction.",
    },
  })

  const c2 = await db.case.create({
    data: {
      caseNumber: "CR-456/2026",
      title: "State vs. Jahangir Alam — Bail Matter (Section 302/34)",
      type: "Bail Matter",
      clientId: client3.id,
      lawyerId: lawyer1.id,
      court: "Metropolitan Magistrate Court",
      district: "Dhaka",
      filingDate: dateOnly(-20),
      status: "ACTIVE",
      priority: "URGENT",
      oppositeParty: "The State of Bangladesh",
      description:
        "Regular bail petition for the accused in Paltan Model Thana FIR No. 118/2026. Client is the wife of the accused; accused allegedly implicated falsely in a criminal breach of trust matter.",
    },
  })

  const c3 = await db.case.create({
    data: {
      caseNumber: "FC-789/2026",
      title: "Shirin Akter vs. Md. Hossain — Maintenance Case",
      type: "Family Case",
      clientId: client3.id,
      lawyerId: lawyer2.id,
      court: "Family Court",
      district: "Cumilla",
      filingDate: dateOnly(-60),
      status: "ACTIVE",
      priority: "MEDIUM",
      oppositeParty: "Md. Hossain Ali",
      description:
        "Claim for monthly maintenance under the Muslim Family Laws Ordinance, 1961 for the petitioner and her minor child. Husband has been absent since March 2025.",
    },
  })

  const c4 = await db.case.create({
    data: {
      caseNumber: "WR-101/2026",
      title: "Rahim Textiles Ltd. vs. Bangladesh Customs — Writ Petition",
      type: "Writ Petition",
      clientId: client2.id,
      lawyerId: lawyer1.id,
      court: "High Court Division",
      district: "Dhaka",
      filingDate: dateOnly(-12),
      status: "PENDING",
      priority: "HIGH",
      oppositeParty: "Commissioner of Customs, Chattogram",
      description:
        "Article 102 writ challenging arbitrary assessment order and detention of imported consignment at Chattogram Port. Rule Nisi issued; pending for hearing of the Rule.",
    },
  })

  const c5 = await db.case.create({
    data: {
      caseNumber: "CS-202/2025",
      title: "Dhaka Traders vs. Meghna Distribution — Money Recovery Suit",
      type: "Civil Case",
      clientId: client4.id,
      lawyerId: lawyer2.id,
      court: "District & Sessions Judge Court",
      district: "Chattogram",
      filingDate: dateOnly(-400),
      status: "CLOSED",
      priority: "MEDIUM",
      oppositeParty: "Meghna Distribution Agency",
      description:
        "Recovery of ৳18,50,000 trade dues under three dishonoured cheques (NI Act sections 138 read with Order XXXVII CPC).",
      resolutionSummary:
        "Case resolved through mutual settlement (salish) mediated before the honourable court. Defendant paid ৳16,00,000 in two instalments; plaintiff waived the remainder.",
      outcome: "Settled / Compromise Decree",
      closedAt: dateOnly(-30),
    },
  })

  const c6 = await db.case.create({
    data: {
      caseNumber: "LB-303/2026",
      title: "Workers of Rahim Textiles vs. Management — Labour Dispute",
      type: "Labour Case",
      clientId: client2.id,
      lawyerId: lawyer1.id,
      court: "Labour Court",
      district: "Dhaka",
      filingDate: dateOnly(-8),
      status: "ON_HOLD",
      priority: "LOW",
      oppositeParty: "Inspector (Labour), Dhaka Region",
      description:
        "Compliance case regarding delay in depositing provident fund contributions. On hold pending internal audit report from the company's finance department.",
    },
  })

  // ================= DOCUMENTS (with real files) =================
  async function seedDoc(
    caseId: string,
    documentName: string,
    documentType: string,
    category: string,
    shared: boolean,
    uploadedByName: string,
    uploadedById: string | null,
    pdfLines: string[]
  ) {
    const dir = join(UPLOADS_ROOT, "seed", caseId)
    mkdirSync(dir, { recursive: true })
    const safe = documentName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const filePath = join(dir, `${Date.now()}-${safe}.pdf`)
    writeFileSync(filePath, makePdf(pdfLines))
    await db.caseDocument.create({
      data: {
        caseId,
        documentName,
        documentType,
        category,
        fileName: `${safe}.pdf`,
        filePath,
        fileSize: 2048 + Math.floor(Math.random() * 900000),
        mimeType: "application/pdf",
        sharedWithClient: shared,
        uploadedById,
        uploadedByName,
      },
    })
  }

  await seedDoc(c1.id, "Vakalatnama — Abdul Karim", "Vakalatnama", "Legal Documents", true, "Rafiq Islam", staff.id, [
    "VAKALATNAMA",
    "Case: CS-123/2026 — District & Sessions Judge Court, Cumilla",
    "I, Abdul Karim, do hereby appoint Adv. Mahmudul Hasan, Advocate,",
    "to act and appear for me in the above-named case.",
    "Signed this day at Cumilla.",
  ])
  await seedDoc(c1.id, "Plaint Copy (Certified)", "Petition", "Legal Documents", true, "Rafiq Islam", staff.id, [
    "CERTIFIED COPY OF PLAINT",
    "Title Suit No. 123 of 2026",
    "Court of the District & Sessions Judge, Cumilla",
    "Plaintiff: Abdul Karim  |  Defendants: Mizanur Rahman & Sons",
  ])
  await seedDoc(c1.id, "Khatian / Porcha (BS Record)", "Evidence", "Evidence", true, "Adv. Mahmudul Hasan", lawyerUser3.id, [
    "COPY OF KHATIAN (PORCHA)",
    "Mouza: Barura, Thana: Barura, District: Cumilla",
    "Khatian No. 412, Dag No. 1180 — Area 0.32 acre",
  ])
  await seedDoc(c1.id, "Status Quo Order — 12 Jan 2026", "Court Order", "Court Orders", false, "Adv. Mahmudul Hasan", lawyerUser3.id, [
    "COURT ORDER",
    "Status quo directed to be maintained over the suit land",
    "until further orders. Next date fixed for injunction hearing.",
  ])

  await seedDoc(c2.id, "FIR Copy — Paltan PS No. 118/2026", "FIR / GD Copy", "Legal Documents", true, "Rafiq Islam", staff.id, [
    "FIRST INFORMATION REPORT (COPY)",
    "Paltan Model Thana, Dhaka — FIR No. 118/2026",
    "Sections: 406/420 of the Penal Code, 1860",
  ])
  await seedDoc(c2.id, "Regular Bail Petition", "Petition", "Legal Documents", false, "Adv. Kamal Hossain", lawyerUser1.id, [
    "REGULAR BAIL PETITION",
    "In the Court of the Chief Metropolitan Magistrate, Dhaka",
    "Accused: Jahangir Alam — GR Case 456/2026",
  ])
  await seedDoc(c2.id, "NID of Accused & Surety", "NID / Supporting Documents", "Client Documents", true, "Rafiq Islam", staff.id, [
    "SUPPORTING DOCUMENTS",
    "National ID copies of the accused and proposed surety.",
  ])

  await seedDoc(c3.id, "Maintenance Petition (MFLO 1961)", "Petition", "Legal Documents", true, "Adv. Nusrat Jahan", lawyerUser2.id, [
    "PETITION UNDER MUSLIM FAMILY LAWS ORDINANCE, 1961",
    "Family Court, Cumilla — Case FC-789/2026",
    "Claim: Monthly maintenance for petitioner and minor child.",
  ])
  await seedDoc(c3.id, "Marriage Certificate (Nikahnama)", "NID / Supporting Documents", "Client Documents", true, "Adv. Nusrat Jahan", lawyerUser2.id, [
    "NIKAHNAMA (COPY)",
    "Marriage solemnised at Nangalkot, Cumilla on 14 March 2019.",
  ])

  await seedDoc(c4.id, "Writ Petition — Article 102", "Petition", "Legal Documents", false, "Adv. Kamal Hossain", lawyerUser1.id, [
    "WRIT PETITION UNDER ARTICLE 102 OF THE CONSTITUTION",
    "High Court Division, Supreme Court of Bangladesh",
    "Writ Petition No. 101 of 2026 — Rule Nisi issued.",
  ])
  await seedDoc(c4.id, "Customs Assessment Order (Challenged)", "Evidence", "Evidence", false, "Rafiq Islam", staff.id, [
    "IMPUGNED ASSESSMENT ORDER",
    "Office of the Commissioner of Customs, Chattogram.",
  ])

  await seedDoc(c5.id, "Final Judgment & Decree", "Judgment", "Court Orders", true, "Adv. Nusrat Jahan", lawyerUser2.id, [
    "JUDGMENT AND DECREE",
    "Money Suit No. 202 of 2025 — District & Sessions Judge Court, Chattogram",
    "Decreed on compromise. Suit disposed of as settled out of court.",
  ])
  await seedDoc(c5.id, "Compromise Petition (Salish)", "Agreement", "Legal Documents", true, "Adv. Nusrat Jahan", lawyerUser2.id, [
    "COMPROMISE PETITION",
    "Terms of settlement executed before the honourable court.",
  ])

  await seedDoc(c6.id, "Complaint Letter to Labour Inspector", "Petition", "Legal Documents", false, "Rafiq Islam", staff.id, [
    "COMPLAINT UNDER THE LABOUR ACT, 2006",
    "Chief Inspector of Factories and Establishments, Dhaka.",
  ])

  // ================= HEARINGS =================
  await db.hearing.createMany({
    data: [
      // c1 — land case
      {
        caseId: c1.id,
        hearingDate: dhakaAt(-7, 10),
        court: "District & Sessions Judge Court, Cumilla",
        judge: "District & Sessions Judge",
        hearingType: "Regular Hearing",
        status: "COMPLETED",
        notes: "Defendants' lawyer sought time for filing written statement.",
        summary: "Written statement filed after cost of ৳2,000. Matter proceeded to evidence stage.",
        courtOrder: "Cost imposed on defendants; evidence of plaintiff to be recorded on next date.",
        nextAction: "Prepare plaintiff (PW-1) for deposition",
        nextHearingDate: dhakaAt(0, 10),
        createdById: staff.id,
      },
      {
        caseId: c1.id,
        hearingDate: dhakaAt(0, 10),
        court: "District & Sessions Judge Court, Cumilla",
        judge: "District & Sessions Judge",
        hearingType: "Evidence / Deposition",
        status: "UPCOMING",
        notes: "PW-1 deposition to be recorded. Bring original porcha copy.",
        createdById: staff.id,
      },
      {
        caseId: c1.id,
        hearingDate: dhakaAt(14, 10),
        court: "District & Sessions Judge Court, Cumilla",
        judge: "District & Sessions Judge",
        hearingType: "Regular Hearing",
        status: "UPCOMING",
        createdById: staff.id,
      },
      // c2 — bail
      {
        caseId: c2.id,
        hearingDate: dhakaAt(-14, 9),
        court: "Metropolitan Magistrate Court, Dhaka",
        judge: "Chief Metropolitan Magistrate",
        hearingType: "Bail Hearing",
        status: "COMPLETED",
        summary: "Bail petition heard; court sought case diary from prosecution.",
        courtOrder: "Case diary called for; bail matter fixed for orders.",
        nextAction: "Submit surety papers",
        nextHearingDate: dhakaAt(1, 9),
      },
      {
        caseId: c2.id,
        hearingDate: dhakaAt(1, 9),
        court: "Metropolitan Magistrate Court, Dhaka",
        judge: "Chief Metropolitan Magistrate",
        hearingType: "Bail Hearing",
        status: "UPCOMING",
        notes: "Order on bail expected. Client and surety must be present.",
      },
      // c3 — family
      {
        caseId: c3.id,
        hearingDate: dhakaAt(-10, 11),
        court: "Family Court, Cumilla",
        judge: "Judge, Family Court",
        hearingType: "Framing of Charge",
        status: "ADJOURNED",
        notes: "Defendant absent; summons served. Case adjourned ex parte step.",
        summary: "Defendant did not appear despite service of summons.",
        nextAction: "Move for ex parte hearing",
        nextHearingDate: dhakaAt(3, 11),
      },
      {
        caseId: c3.id,
        hearingDate: dhakaAt(3, 11),
        court: "Family Court, Cumilla",
        judge: "Judge, Family Court",
        hearingType: "Regular Hearing",
        status: "UPCOMING",
        notes: "Ex parte evidence to be recorded if defendant remains absent.",
      },
      // c4 — writ
      {
        caseId: c4.id,
        hearingDate: dhakaAt(30, 10),
        court: "High Court Division, Supreme Court of Bangladesh",
        judge: "Hon'ble Justice Bench 4",
        hearingType: "Order Date",
        status: "UPCOMING",
        notes: "Rule Nisi returnable date. Advocate-on-record to file supplementary affidavit.",
      },
      // c5 — closed civil case
      {
        caseId: c5.id,
        hearingDate: dhakaAt(-30, 10),
        court: "District & Sessions Judge Court, Chattogram",
        judge: "District & Sessions Judge",
        hearingType: "Judgment",
        status: "COMPLETED",
        summary: "Compromise decree drawn up. Suit disposed of as settled out of court.",
        courtOrder: "Decree on compromise; each party to bear own costs.",
        nextAction: "Execute settlement instalments (completed)",
      },
      // c6 — labour (on hold)
      {
        caseId: c6.id,
        hearingDate: dhakaAt(7, 10),
        court: "Labour Court, Dhaka",
        judge: "Chairman, Labour Court",
        hearingType: "Miscellaneous",
        status: "UPCOMING",
        notes: "Time petition for compliance filing — subject to audit report.",
      },
    ],
  })

  // ================= INVOICES & PAYMENTS =================
  const inv1 = await db.invoice.create({
    data: {
      invoiceNumber: "INV-2026-0001",
      caseId: c1.id,
      clientId: client1.id,
      billingType: "Lawyer Fee",
      description: "Professional fee for land suit — evidence stage (1st tranche)",
      amount: 50000,
      dueDate: dateOnly(10),
      status: "PARTIAL",
      createdById: admin.id,
    },
  })
  const inv2 = await db.invoice.create({
    data: {
      invoiceNumber: "INV-2026-0002",
      caseId: c1.id,
      clientId: client1.id,
      billingType: "Case Filing Fee",
      description: "Court filing & process fees — Title Suit 123/2026",
      amount: 15000,
      dueDate: dateOnly(-5),
      status: "UNPAID",
      createdById: admin.id,
    },
  })
  const inv3 = await db.invoice.create({
    data: {
      invoiceNumber: "INV-2026-0003",
      caseId: c2.id,
      clientId: client3.id,
      billingType: "Lawyer Fee",
      description: "Bail matter — full professional fee",
      amount: 30000,
      dueDate: dateOnly(20),
      status: "PAID",
      createdById: admin.id,
    },
  })
  const inv4 = await db.invoice.create({
    data: {
      invoiceNumber: "INV-2026-0004",
      caseId: c4.id,
      clientId: client2.id,
      billingType: "Court Fee",
      description: "Writ petition court fee & advocate-on-record charges",
      amount: 8000,
      dueDate: dateOnly(15),
      status: "UNPAID",
      createdById: admin.id,
    },
  })
  const inv5 = await db.invoice.create({
    data: {
      invoiceNumber: "INV-2026-0005",
      caseId: c5.id,
      clientId: client4.id,
      billingType: "Lawyer Fee",
      description: "Money recovery suit — final professional fee",
      amount: 60000,
      dueDate: dateOnly(-30),
      status: "PAID",
      createdById: admin.id,
    },
  })
  const inv6 = await db.invoice.create({
    data: {
      invoiceNumber: "INV-2026-0006",
      caseId: c3.id,
      clientId: client3.id,
      billingType: "Consultation Fee",
      description: "Initial consultation & case strategy session",
      amount: 5000,
      dueDate: dateOnly(-15),
      status: "PAID",
      createdById: admin.id,
    },
  })

  await db.payment.createMany({
    data: [
      {
        invoiceId: inv1.id,
        amount: 20000,
        paymentMethod: "bKash",
        paymentDate: dhakaAt(-9, 14),
        referenceNumber: "BKX-7734012",
        notes: "1st tranche received via bKash personal",
        receivedById: admin.id,
        receivedByName: "Arif Rahman",
      },
      {
        invoiceId: inv3.id,
        amount: 30000,
        paymentMethod: "Cash",
        paymentDate: dhakaAt(-6, 12),
        referenceNumber: "MONEY-RCPT-014",
        notes: "Full payment received at chamber",
        receivedById: admin.id,
        receivedByName: "Arif Rahman",
      },
      {
        invoiceId: inv5.id,
        amount: 60000,
        paymentMethod: "Bank Transfer",
        paymentDate: dhakaAt(-28, 15),
        referenceNumber: "BRAC-A/C-1501-8892",
        notes: "NEFT from Dhaka Traders corporate account",
        receivedById: admin.id,
        receivedByName: "Arif Rahman",
      },
      {
        invoiceId: inv6.id,
        amount: 5000,
        paymentMethod: "Nagad",
        paymentDate: dhakaAt(-16, 10),
        referenceNumber: "NGD-5520198",
        receivedById: staff.id,
        receivedByName: "Rafiq Islam",
      },
    ],
  })

  // ================= CASE UPDATES =================
  await db.caseUpdate.createMany({
    data: [
      {
        caseId: c1.id,
        update: "Written statement filed by defendants. Court imposed ৳2,000 cost for delay.",
        createdById: lawyerUser3.id,
        createdByName: "Adv. Mahmudul Hasan",
        createdAt: dhakaAt(-7, 12),
      },
      {
        caseId: c1.id,
        update: "Evidence date fixed. Client advised to bring original Khatian and boundary map.",
        createdById: staff.id,
        createdByName: "Rafiq Islam",
        createdAt: dhakaAt(-2, 16),
      },
      {
        caseId: c2.id,
        update: "Case diary called for by the court. Bail order expected on next date.",
        createdById: lawyerUser1.id,
        createdByName: "Adv. Kamal Hossain",
        createdAt: dhakaAt(-14, 13),
      },
      {
        caseId: c3.id,
        update: "Defendant served with summons but absent. Next step: ex parte evidence.",
        createdById: lawyerUser2.id,
        createdByName: "Adv. Nusrat Jahan",
        createdAt: dhakaAt(-10, 14),
      },
      {
        caseId: c4.id,
        update: "Rule Nisi issued by the High Court Division. Supplementary affidavit being prepared.",
        createdById: lawyerUser1.id,
        createdByName: "Adv. Kamal Hossain",
        createdAt: dhakaAt(-5, 11),
      },
      {
        caseId: c5.id,
        update: "Suit settled through salish. Compromise decree drawn; final instalment received.",
        createdById: lawyerUser2.id,
        createdByName: "Adv. Nusrat Jahan",
        createdAt: dhakaAt(-30, 12),
      },
      {
        caseId: c6.id,
        update: "Matter on hold pending internal provident fund audit report from finance team.",
        createdById: staff.id,
        createdByName: "Rafiq Islam",
        createdAt: dhakaAt(-3, 10),
      },
    ],
  })

  // ================= NOTIFICATIONS =================
  await db.notification.createMany({
    data: [
      {
        userId: admin.id,
        title: "Hearing Today — CS-123/2026",
        message: "Evidence / Deposition at District & Sessions Judge Court, Cumilla — 10:00 AM.",
        type: "HEARING",
        caseId: c1.id,
        link: `case-detail:${c1.id}`,
      },
      {
        userId: admin.id,
        title: "Payment Received — ৳30,000",
        message: "Cash payment received for INV-2026-0003 (bail matter, Shirin Akter).",
        type: "BILLING",
      },
      {
        userId: admin.id,
        title: "Invoice Overdue — INV-2026-0002",
        message: "Case filing fee ৳15,000 for CS-123/2026 (Abdul Karim) is past due.",
        type: "BILLING",
        caseId: c1.id,
        link: `case-detail:${c1.id}`,
      },
      {
        userId: lawyerUser1.id,
        title: "Bail Order Tomorrow — CR-456/2026",
        message: "Order on bail expected. Client and surety must be present at 9:00 AM.",
        type: "HEARING",
        caseId: c2.id,
        link: `case-detail:${c2.id}`,
      },
      {
        userId: clientUser1.id,
        title: "Hearing Today — CS-123/2026",
        message: "Your land case hearing is scheduled today at 10:00 AM, District & Sessions Judge Court, Cumilla.",
        type: "HEARING",
        caseId: c1.id,
        link: `case-detail:${c1.id}`,
      },
      {
        userId: clientUser1.id,
        title: "Invoice Overdue — INV-2026-0002",
        message: "Your invoice of ৳15,000 (case filing fee) is past due. Please clear at your earliest.",
        type: "BILLING",
        caseId: c1.id,
        link: `case-detail:${c1.id}`,
      },
    ],
  })

  // ================= SUMMARY =================
  const counts = {
    users: await db.user.count(),
    lawyers: await db.lawyer.count(),
    clients: await db.client.count(),
    cases: await db.case.count(),
    hearings: await db.hearing.count(),
    documents: await db.caseDocument.count(),
    invoices: await db.invoice.count(),
    payments: await db.payment.count(),
    updates: await db.caseUpdate.count(),
    notifications: await db.notification.count(),
  }
  console.log("Seed complete:", counts)
  console.log(`
Demo accounts (passwords included):
  Admin  : admin@ainsheba.bd  / Admin@123
  Lawyer : kamal@ainsheba.bd  / Lawyer@123  (also nusrat@ / mahmud@)
  Staff  : staff@ainsheba.bd  / Staff@123
  Client : client@ainsheba.bd / Client@123
`)
}

main()
  .catch((e) => {
    console.error("Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
