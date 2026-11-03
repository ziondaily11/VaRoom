import type { Block, Inline, Section } from "./LegalDocumentPage";

export const TERMS_TITLE = "Terms of Service | Varoom";
export const TERMS_DESCRIPTION = "Varoom Terms of Service governing the use of the Varoom property marketplace.";
export const LAST_UPDATED = "November 3, 2026";

const b = (strong: string): Inline => ({ strong });
const a = (text: string, href: string): Inline => ({ text, href });
const p = (...content: Inline[]): Block => ({ type: "p", content });
const ul = (...items: string[]): Block => ({ type: "ul", items });
const notice = (...content: Inline[]): Block => ({ type: "notice", content });
const contact = (title: string, ...lines: Inline[][]): Block => ({ type: "contact", title, lines });

export const intro: Block[] = [
  p(
    "Welcome to Varoom. These Terms of Service govern your access to and use of the Varoom website, platform, and related services."
  ),
  p(
    "By creating an account or using Varoom, you agree to these Terms. If you do not agree with these Terms, you should not use Varoom."
  ),
];

export const sections: Section[] = [
  {
    id: "about-varoom",
    title: "About Varoom",
    blocks: [
      p(
        "Varoom is a property marketplace that connects people who have properties to list (\"Hosts\") with people looking for properties (\"Clients\")."
      ),
      p("Varoom currently operates in Kenya."),
      p(
        "Varoom itself does not own, sell, rent, lease, manage, or guarantee the properties listed by users. Varoom provides the technology and marketplace through which users can discover properties, communicate, and arrange bookings."
      ),
      p(
        "Varoom is not a party to any agreement between a Host and a Client, does not act as an agent, broker, or representative of either party, and does not receive, hold, or transfer money on behalf of users."
      ),
      notice(b("Important:"), " A listing on Varoom does not mean that Varoom owns, manages, guarantees, or legally represents the property or the person listing it."),
    ],
  },
  {
    id: "eligibility",
    title: "Eligibility",
    blocks: [
      p("You must be at least ", b("18 years old"), " to create or use a Varoom account."),
      p(
        "By using Varoom, you confirm that you meet this age requirement and that the information you provide is accurate."
      ),
    ],
  },
  {
    id: "user-accounts",
    title: "User Accounts",
    blocks: [
      p(
        "Users may create accounts as Hosts or Clients depending on the functionality available to them."
      ),
      p(
        "You are responsible for maintaining the security of your account and for activity carried out through your account."
      ),
      p(
        "You must not create an account using false information, impersonate another person, or use another person's account without permission."
      ),
    ],
  },
  {
    id: "hosts-and-property-listings",
    title: "Hosts and Property Listings",
    blocks: [
      p(
        "Hosts may use Varoom to list properties available for renting, booking, sale, or other permitted property-related purposes."
      ),
      p("Property categories may include:"),
      ul("Houses", "Apartments", "Rooms", "Land", "Commercial buildings", "Offices", "Shops", "Hotels and short-stay properties"),
      p(
        "Hosts are solely responsible for ensuring that their listings are accurate, lawful, current, and not misleading."
      ),
      p(
        "Hosts must have the legal right, ownership, authorization, or other appropriate permission required to list a property on Varoom."
      ),
      p(
        "Hosts must not knowingly list property they do not have the authority to advertise or offer."
      ),
    ],
  },
  {
    id: "host-verification",
    title: "Host Verification",
    blocks: [
      p(
        "Varoom may use location and GPS-based verification to help verify the location associated with a property listing."
      ),
      p(
        "Verification may be expanded or strengthened as Varoom develops, including additional checks designed to improve marketplace safety and trust."
      ),
      p(
        "A verification process does not constitute a guarantee by Varoom that a property, Host, ownership claim, condition, or transaction is completely legitimate or suitable."
      ),
    ],
  },
  {
    id: "client-responsibilities",
    title: "Client Responsibilities",
    blocks: [
      p(
        "Clients are responsible for reviewing property information carefully before making a booking or entering into an arrangement with a Host."
      ),
      p(
        "Clients should communicate with Hosts through Varoom where appropriate and should provide accurate information when making a booking."
      ),
      p(
        "Clients should not use Varoom to submit fraudulent booking requests, intentionally mislead Hosts, or abuse the platform."
      ),
    ],
  },
  {
    id: "bookings",
    title: "Bookings",
    blocks: [
      p(
        "Booking procedures may differ depending on the property and the services offered by the Host."
      ),
      p(
        "Where a booking is available through Varoom, a Client may provide the required booking information, select applicable dates for short stays, and submit the booking request."
      ),
      p(
        "Where Host approval is required, the booking is not considered accepted until the Host approves it."
      ),
      p(
        "Booking details, dates, requirements, prices, and other conditions may vary between listings."
      ),
    ],
  },
  {
    id: "payments-between-hosts-and-clients",
    title: "Payments Between Hosts and Clients",
    blocks: [
      notice(
        b("No money passes through Varoom."),
        " Rent, deposits, booking payments, purchase prices, and any other sums relating to a property are paid directly between the Client and the Host. Varoom does not collect, receive, hold, or transfer these funds."
      ),
      p(
        "The Host and the Client are solely responsible for agreeing the amount, timing, method, and conditions of any payment, and for keeping their own records of payments made and received."
      ),
      p(
        "Varoom does not process booking or property payments, does not issue receipts on behalf of Hosts, and does not verify that a payment has been made or received."
      ),
      p(
        "Clients should be cautious before making any payment, should satisfy themselves that the Host is entitled to receive it, and should avoid paying in advance for a property they have not been able to verify. Varoom will never ask a Client to send money for a property to a Varoom account or to a third party on Varoom's behalf."
      ),
    ],
  },
  {
    id: "no-escrow",
    title: "No Escrow or Payment Protection",
    blocks: [
      p(
        "Varoom does not provide escrow, payment holding, guarantee, or payment protection services of any kind."
      ),
      p(
        "Because Varoom never holds funds, it cannot release, withhold, reverse, or recover a payment made between users, and it does not compensate users for payments lost through a dispute, non-performance, or fraud by another user."
      ),
      p(
        "Users who require independent protection for a transaction should arrange it themselves, for example through a licensed escrow provider, an advocate, or another appropriately qualified professional."
      ),
    ],
  },
  {
    id: "agreements-and-documentation",
    title: "Agreements and Documentation",
    blocks: [
      p(
        "All agreements and paperwork relating to a property are the responsibility of the Host and the Client. This includes, where applicable:"
      ),
      ul("Tenancy, lease, or booking agreements", "Sale agreements and transfer documents", "Deposit and payment receipts", "Inventories and condition reports", "Identity, ownership, and title verification", "Taxes, stamp duty, registrations, and other statutory obligations"),
      p(
        "Varoom does not prepare, review, witness, store on behalf of the parties, or enforce these documents. Users should seek independent legal or professional advice where appropriate."
      ),
    ],
  },
  {
    id: "cancellations-and-refunds",
    title: "Cancellations and Refunds",
    blocks: [
      p(
        "Cancellation and refund terms for a property are set by the Host and agreed between the Host and the Client."
      ),
      p(
        "Because Varoom does not handle payments between users, any refund of rent, deposits, booking payments, or other property-related sums must be requested from and settled by the party who received the payment. Varoom is not liable for such refunds."
      ),
      p(
        "Varoom may, at its discretion, investigate reports of suspected fraud, scams, or payment abuse, and may restrict or remove accounts or listings involved. Such action does not make Varoom responsible for recovering any funds."
      ),
    ],
  },
  {
    id: "varoom-fees",
    title: "Varoom Fees and Host Plans",
    blocks: [
      p(
        "The only payments Varoom receives are fees for its own services, such as subscription plans that Hosts may purchase to unlock additional listing capacity, analytics, and promotion eligibility."
      ),
      p(
        "Plan fees are processed by Varoom's third-party payment provider and are shown to the Host before purchase. They are payments for Varoom's services and are entirely separate from any money exchanged between Hosts and Clients."
      ),
      p(
        "Varoom does not charge Clients to browse listings, contact Hosts, or make bookings. Varoom may introduce or change fees in the future, and will communicate any new or changed fees before they apply."
      ),
    ],
  },
  {
    id: "messaging",
    title: "Messaging",
    blocks: [
      p(
        "Varoom allows Clients and Hosts to communicate directly through the platform."
      ),
      p("Users are responsible for their own communications and interactions."),
      p(
        "Varoom does not routinely access the private content of user-to-user chats."
      ),
      p(
        "However, Varoom may take action where necessary to comply with law, protect the platform, investigate serious abuse or security incidents, or respond to reports where information is lawfully available."
      ),
    ],
  },
  {
    id: "reviews-complaints-and-reports",
    title: "Reviews, Complaints, and Reports",
    blocks: [
      p(
        "Varoom may collect reviews, complaints, and reports submitted by users to help maintain the quality, safety, and integrity of the platform."
      ),
      p(
        "Clients may report suspected scams, fraudulent listings, misleading information, inappropriate conduct, or other violations."
      ),
      p(
        "Varoom may investigate reports and may suspend, restrict, remove, or permanently ban accounts where violations are confirmed or where action is reasonably necessary to protect users or the platform."
      ),
    ],
  },
  {
    id: "prohibited-conduct",
    title: "Prohibited Conduct",
    blocks: [
      p("Users must not use Varoom to:"),
      ul("Post fraudulent or knowingly misleading property listings", "List property without appropriate authority or permission", "Impersonate another person or organization", "Commit fraud or facilitate scams", "Harass, threaten, or abuse other users", "Submit intentionally false reports or reviews", "Attempt to gain unauthorized access to another account", "Interfere with the operation or security of Varoom", "Use Varoom for unlawful activities", "Request or collect payments under false pretences, or misrepresent that a payment is made to or guaranteed by Varoom", "Attempt to bypass applicable Varoom fees through prohibited means"),
    ],
  },
  {
    id: "suspension-and-termination",
    title: "Suspension and Termination",
    blocks: [
      p(
        "Varoom may suspend, restrict, or terminate an account where we reasonably believe that the user has violated these Terms, engaged in fraud or abuse, created a safety risk, submitted fraudulent listings, misused the platform, or otherwise threatened the integrity of Varoom."
      ),
      p(
        "Varoom may also remove individual listings or content that violates these Terms or applicable law."
      ),
    ],
  },
  {
    id: "account-deletion",
    title: "Account Deletion",
    blocks: [
      p(
        "You may delete your Varoom account at any time from your account settings."
      ),
      p(
        "When you delete your account, it is deactivated for a period of ", b("30 days"), " before it is permanently deleted. During this period your profile and listings are no longer available to other users, but your account and its related information are retained."
      ),
      p(
        "Signing in to your account in the usual way at any time during the 30-day period reactivates it. If you do not sign in during that period, Varoom will permanently delete your account and its related information. Permanent deletion cannot be undone, and deleted accounts, listings, and content cannot be recovered."
      ),
      p(
        "Deleting your account does not cancel obligations you have already entered into with other users, such as bookings, tenancies, or sales, and does not entitle you to a refund of fees already paid to Varoom for host plans. Varoom may retain certain information after deletion as described in our ",
        a("Privacy Policy", "/privacy"),
        "."
      ),
    ],
  },
  {
    id: "property-transactions-and-user-relationships",
    title: "Property Transactions and User Relationships",
    blocks: [
      p(
        "Varoom provides a platform for users to discover properties and communicate with one another."
      ),
      p(
        "Hosts and Clients are responsible for the agreements and arrangements they enter into with one another."
      ),
      p(
        "Varoom does not guarantee the ownership, condition, quality, safety, legality, availability, value, or suitability of a property listed by a user."
      ),
      p(
        "Users should conduct whatever checks they consider appropriate before entering into a property-related agreement."
      ),
    ],
  },
  {
    id: "purchases-and-property-sales",
    title: "Purchases and Property Sales",
    blocks: [
      p(
        "Where a property is advertised for sale, Varoom may provide a platform for the interested parties to discover the property and communicate."
      ),
      p(
        "Varoom does not participate in, complete, or guarantee any sale, and no part of the purchase price or any deposit is paid to or through Varoom."
      ),
      p(
        "Buyers and sellers are responsible for completing any required agreements, due diligence, legal procedures, ownership transfers, payments, taxes, registrations, and other requirements associated with a property transaction."
      ),
    ],
  },
  {
    id: "artificial-intelligence-and-search-features",
    title: "Artificial Intelligence and Search Features",
    blocks: [
      p(
        "Varoom may provide free tools such as an AI assistant for Hosts and an AI-powered search or helper feature for Clients."
      ),
      p(
        "These tools are intended to assist users and may provide information, suggestions, or search assistance. They should not be treated as a substitute for professional legal, financial, property, or other specialized advice."
      ),
      p(
        "AI-generated or assisted information may contain errors or omissions, and users remain responsible for decisions they make using the platform."
      ),
    ],
  },
  {
    id: "user-content",
    title: "User Content",
    blocks: [
      p(
        "Users may submit property descriptions, photographs, reviews, messages, reports, and other content to Varoom."
      ),
      p(
        "You are responsible for ensuring that content you submit is accurate, lawful, and does not violate another person's rights."
      ),
      p(
        "By submitting content to Varoom, you grant Varoom permission to use, store, display, reproduce, and process that content as reasonably necessary to operate and provide the platform."
      ),
    ],
  },
  {
    id: "varoom-intellectual-property",
    title: "Varoom Intellectual Property",
    blocks: [
      p(
        "The Varoom name, logo, website, software, design, platform features, and other materials created by or for Varoom may be protected by applicable intellectual property laws."
      ),
      p(
        "Users may not copy, reproduce, modify, distribute, sell, or exploit Varoom's protected materials without appropriate authorization."
      ),
    ],
  },
  {
    id: "third-party-services",
    title: "Third-Party Services",
    blocks: [
      p(
        "Varoom may rely on third-party services for functions such as authentication, email delivery, hosting, payments, security, analytics, or other infrastructure."
      ),
      p(
        "Third-party services may have their own terms and policies, and users may be required to comply with those terms when using related features."
      ),
    ],
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    blocks: [
      p(
        "Varoom is provided as a marketplace and technology platform. We do not guarantee that the platform will always be available, uninterrupted, secure, or error-free."
      ),
      p(
        "Varoom does not guarantee the accuracy or completeness of information provided by Hosts or Clients."
      ),
      p(
        "Varoom does not guarantee that a property will meet a Client's expectations or that a Host or Client will perform their obligations."
      ),
    ],
  },
  {
    id: "limitation-of-responsibility",
    title: "Limitation of Responsibility",
    blocks: [
      p(
        "To the extent permitted by applicable law, Varoom is not responsible for losses, disputes, damages, injuries, fraud, property conditions, inaccurate listings, or other consequences arising primarily from interactions or agreements between users."
      ),
      p(
        "Nothing in these Terms is intended to exclude liability that cannot legally be excluded under applicable law."
      ),
    ],
  },
  {
    id: "changes-to-varoom",
    title: "Changes to Varoom",
    blocks: [
      p(
        "Varoom is an evolving platform. Features, services, plans, fees, verification processes, AI tools, property categories, and other functionality may change over time."
      ),
      p(
        "We may add, modify, suspend, or discontinue features as Varoom develops."
      ),
    ],
  },
  {
    id: "changes-to-these-terms",
    title: "Changes to These Terms",
    blocks: [
      p(
        "We may update these Terms as Varoom develops or as legal or operational requirements change."
      ),
      p(
        "When we make material changes, we will update the \"Last updated\" date and provide additional notice where appropriate."
      ),
      p(
        "Continued use of Varoom after updated Terms become effective means that you accept the updated Terms, subject to applicable law."
      ),
    ],
  },
  {
    id: "governing-law",
    title: "Governing Law",
    blocks: [
      p(
        "Varoom currently operates in Kenya. These Terms are intended to be governed by the applicable laws of Kenya, subject to any mandatory legal requirements that may apply."
      ),
    ],
  },
  {
    id: "contact-us",
    title: "Contact Us",
    blocks: [
      contact("Varoom",
          ["Operated by Elvis Lwangu"],
          ["Email: ", a("privacy@varoom.co.ke", "mailto:privacy@varoom.co.ke")],
          ["Website: ", a("varoom.co.ke", "https://varoom.co.ke")],
      ),
    ],
  },
];
