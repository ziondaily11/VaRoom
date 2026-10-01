import type { Block, Inline, Section } from "./LegalDocumentPage";

export const TERMS_TITLE = "Terms of Service | Varoom";
export const TERMS_DESCRIPTION = "Varoom Terms of Service governing the use of the Varoom property marketplace.";
export const LAST_UPDATED = "August 18, 2026";

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
        "Varoom itself does not own, sell, rent, lease, manage, or guarantee the properties listed by users. Varoom provides the technology and marketplace through which users can discover properties, communicate, arrange bookings, and, where available, use Varoom's payment services."
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
    id: "payments-through-varoom",
    title: "Payments Through Varoom",
    blocks: [
      p(
        "Varoom may provide an optional payment service through which Clients can choose to have a payment processed through Varoom."
      ),
      p(
        "Where this service is available and selected, Varoom may receive and temporarily hold funds associated with a booking before those funds become available to the Host."
      ),
      p(
        "Hosts may be able to request withdrawal of available funds through the Host tools provided by Varoom."
      ),
      p(
        "Where applicable, a Varoom service fee may be deducted when funds are withdrawn or processed. Any applicable fees will be communicated to users through the relevant Varoom functionality."
      ),
      p(
        "Varoom's payment functionality, payment providers, settlement periods, fees, refunds, and withdrawal procedures may change as the service develops."
      ),
    ],
  },
  {
    id: "payments-directly-to-hosts",
    title: "Payments Directly to Hosts",
    blocks: [
      p(
        "Where Varoom allows a Host to receive payment directly rather than through Varoom, the Client and Host may arrange payment according to the terms of the listing or booking."
      ),
      p(
        "For example, a Host may allow a Client to pay upon arrival at the property."
      ),
      p(
        "Where a Client chooses to pay directly to a Host and subsequently becomes dissatisfied with the property or requests a refund, Varoom is generally not responsible for that payment or refund."
      ),
      p(
        "Varoom may investigate reports involving suspected payment abuse, fraud, scams, or violations of these Terms."
      ),
    ],
  },
  {
    id: "cancellations-and-refunds",
    title: "Cancellations and Refunds",
    blocks: [
      p(
        "Cancellation and refund rules may vary depending on the property, booking conditions, Host, and payment method."
      ),
      p(
        "Where Varoom processes and holds a Client's payment, Varoom may process a refund or cancellation in accordance with the applicable booking conditions and Varoom's procedures."
      ),
      p(
        "If a Client does not settle a required payment associated with a booking, Varoom may, where applicable, cancel the booking and refund funds according to the circumstances and applicable booking terms."
      ),
      p(
        "Varoom is not responsible for refunds relating to transactions that occurred entirely outside Varoom's payment system, except where intervention is appropriate because of suspected fraud, payment abuse, or another violation of these Terms."
      ),
    ],
  },
  {
    id: "varoom-fees",
    title: "Varoom Fees",
    blocks: [
      p(
        "Varoom is currently provided without mandatory platform fees for ordinary use."
      ),
      p(
        "Varoom may introduce service fees, transaction fees, listing fees, withdrawal fees, or other charges in the future."
      ),
      p(
        "Any applicable fees will be communicated before they apply to a transaction where required."
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
      ul("Post fraudulent or knowingly misleading property listings", "List property without appropriate authority or permission", "Impersonate another person or organization", "Commit fraud or facilitate scams", "Harass, threaten, or abuse other users", "Submit intentionally false reports or reviews", "Attempt to gain unauthorized access to another account", "Interfere with the operation or security of Varoom", "Use Varoom for unlawful activities", "Abuse payment or refund systems", "Attempt to bypass applicable Varoom fees through prohibited means"),
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
        "Unless Varoom expressly provides a transaction service for a particular purchase, Varoom does not itself complete or guarantee the sale."
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
        "Varoom is an evolving platform. Features, services, payment options, fees, verification processes, AI tools, property categories, and other functionality may change over time."
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
