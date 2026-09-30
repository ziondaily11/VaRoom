export type Inline = string | { strong: string } | { text: string; href: string };

export type Block =
  | { type: "p"; content: Inline[] }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "contact"; title: string; lines: Inline[][] };

export interface Section {
  id: string;
  title: string;
  blocks: Block[];
}

export const LAST_UPDATED = "September 30, 2026";

const b = (strong: string): Inline => ({ strong });
const mail: Inline = { text: "privacy@varoom.co.ke", href: "mailto:privacy@varoom.co.ke" };
const support: Inline = { text: "support@varoom.co.ke", href: "mailto:support@varoom.co.ke" };
const p = (...content: Inline[]): Block => ({ type: "p", content });
const h3 = (text: string): Block => ({ type: "h3", text });
const ul = (...items: string[]): Block => ({ type: "ul", items });

export const intro: Block[] = [
  p(
    "Welcome to Varoom. Varoom is a property marketplace that allows hosts to list properties for renting, buying, or other permitted property-related transactions, while clients can discover properties, make bookings, communicate with hosts, and use related services."
  ),
  p(
    "This Privacy Policy explains what personal information we collect, why we collect it, how we use, share, and protect it, and the choices and rights you have. By creating an account or using Varoom, you acknowledge that you have read this policy."
  ),
];

export const sections: Section[] = [
  {
    id: "who-we-are",
    title: "Who We Are",
    blocks: [
      p(
        "Varoom, available at varoom.co.ke, is managed and operated by Varoom (\"Varoom\", \"we\", \"us\", or \"our\"). For the purposes of applicable data protection law, Varoom is the data controller of personal information collected through the platform."
      ),
      {
        type: "contact",
        title: "How to reach us",
        lines: [
          ["Privacy and data requests: ", mail],
          ["General support: ", support],
        ],
      },
    ],
  },
  {
    id: "information-we-collect",
    title: "Information We Collect",
    blocks: [
      p("Depending on how you use Varoom, we may collect the following."),
      h3("Information you provide"),
      ul(
        "Account details: name, email address, profile picture, and phone number if you choose to provide it",
        "Property listings and related information, including descriptions, photos, pricing, and availability",
        "Booking information and related transaction records",
        "Messages you send to other users and to Elie, our search assistant",
        "Reviews, ratings, and reports you submit",
        "Information you send us when you contact support"
      ),
      h3("Information from Google"),
      p(
        "If you sign in with Google, we receive your name, email address, profile picture, and Google account identifier, as described in the Google Sign-In section below."
      ),
      h3("Information collected automatically"),
      p(
        "When you use Varoom we may collect technical information such as your IP address, browser and device type, pages viewed, and log data, and, if you grant permission, your device location. We use this to operate, secure, and improve the service."
      ),
    ],
  },
  {
    id: "google-sign-in",
    title: "Google Sign-In",
    blocks: [
      p(
        "If you choose to sign in using Google, Varoom may receive information made available through your Google account and the permissions requested during sign-in, including your name, email address, profile picture, and Google account identifier."
      ),
      p(
        "We use this information to create and authenticate your Varoom account, associate your Google account with your Varoom account, and provide account-related functionality."
      ),
      p(
        "Varoom does not sell Google user data and does not use Google user data for targeted advertising. Varoom's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements."
      ),
    ],
  },
  {
    id: "how-we-use-information",
    title: "How We Use Information",
    blocks: [
      p("We use collected information to:"),
      ul(
        "Create and manage user accounts and authenticate users",
        "Allow hosts to create and manage property listings",
        "Allow clients to discover and interact with listings, including through Elie",
        "Process and manage bookings",
        "Facilitate communication between users",
        "Process or record payments and related transactions",
        "Display reviews and ratings",
        "Investigate reports, abuse, fraud, or security issues",
        "Provide customer support",
        "Improve the functionality and reliability of Varoom",
        "Comply with applicable legal obligations"
      ),
    ],
  },
  {
    id: "legal-bases",
    title: "Legal Bases for Processing",
    blocks: [
      p(
        "We process personal information only where we have a lawful basis to do so under applicable law, including the Kenya Data Protection Act, 2019. Depending on the activity, our basis is:"
      ),
      ul(
        "Your consent, for example when you grant location permission or choose to provide an optional phone number",
        "Performance of a contract with you, for example creating your account and processing bookings",
        "Compliance with a legal obligation, for example financial record keeping",
        "Our legitimate interests, for example keeping Varoom secure and preventing fraud and abuse"
      ),
      p("Where we rely on consent, you can withdraw it at any time without affecting processing that already took place."),
    ],
  },
  {
    id: "elie-ai-assistant",
    title: "Elie, Our AI Search Assistant",
    blocks: [
      p(
        "Varoom offers Elie, an AI-powered assistant that helps clients search for properties. When you send Elie a message, its text is sent to a third-party AI provider (currently Google) to interpret your request, such as the type of property and location you want. Elie then searches Varoom listings and returns matching results."
      ),
      p(
        "Please do not include sensitive personal information, such as financial details or government ID numbers, in messages to Elie. Elie's responses are generated automatically and may not always be accurate, so please verify listing details before booking."
      ),
    ],
  },
  {
    id: "sharing-of-information",
    title: "Sharing of Information",
    blocks: [
      p("We may share information when reasonably necessary to provide the services you request."),
      p(
        "For example, information from a property listing may be visible to users viewing that listing, information necessary to facilitate a booking may be shared with the relevant parties, and messages may be accessible to the participants in a conversation."
      ),
      p(
        "Information may also be processed by service providers that help us provide authentication, email delivery, payments, hosting, maps, AI features, security, or other infrastructure. These providers may use it only to perform services for us."
      ),
      p(
        "We may disclose information when required by applicable law or when reasonably necessary to protect Varoom, its users, or others."
      ),
      p(b("We do not sell personal information to third parties.")),
    ],
  },
  {
    id: "payments",
    title: "Payments",
    blocks: [
      p(
        "Varoom may use third-party payment service providers, which may include mobile money and card processors, to process payments. Payment information may be handled directly by those providers according to their own terms and privacy policies, and Varoom does not store your full card details or mobile money PIN."
      ),
      p(
        "Varoom may retain transaction records necessary for bookings, accounting, disputes, security, and operational purposes."
      ),
    ],
  },
  {
    id: "messages-and-communications",
    title: "Messages and Communications",
    blocks: [
      p(
        "Varoom may store messages sent through the platform so users can access their conversations and so we can provide messaging functionality, address reports, investigate abuse, maintain security, and comply with applicable legal requirements."
      ),
      p("We do not use private messages for advertising."),
    ],
  },
  {
    id: "addresses-and-locations",
    title: "Property Addresses and Locations",
    blocks: [
      p(
        "Hosts may provide property addresses or location information when creating listings. Varoom is designed to limit how precisely a location is shown: the general area, such as neighbourhood or city, may be visible to everyone, more precise details only to users with an approved booking, and full details to the host."
      ),
      p(
        "If you grant location permission on your device, we may use your location to show distances to properties. We ask for permission only when a feature needs it, and you can decline or withdraw it at any time in your browser or device settings."
      ),
      p(
        "Maps and place search may be provided by Google Maps Platform, which may receive location-related requests made through Varoom and handles them under Google's own privacy policy."
      ),
    ],
  },
  {
    id: "reviews-and-reports",
    title: "Reviews and Reports",
    blocks: [
      p("Reviews and ratings may be displayed to other users as part of Varoom's marketplace functionality."),
      p(
        "Reports may be reviewed for safety, fraud prevention, dispute resolution, moderation, and security purposes."
      ),
    ],
  },
  {
    id: "cookies",
    title: "Cookies and Similar Technologies",
    blocks: [
      p(
        "We use cookies and similar technologies, such as browser local storage, to keep you signed in, remember preferences such as your display theme, and keep the service secure. You can clear or block these in your browser settings, but parts of Varoom may not work without them."
      ),
    ],
  },
  {
    id: "data-security",
    title: "Data Security",
    blocks: [
      p(
        "We take reasonable technical and organizational measures designed to protect information from unauthorized access, alteration, disclosure, or destruction, including encrypted connections, authentication and access controls, and limiting access to personal information to those who need it."
      ),
      p(
        "However, no online service can guarantee absolute security. If a breach affects your personal information, we will notify you and the relevant authorities as required by applicable law."
      ),
    ],
  },
  {
    id: "data-retention",
    title: "Data Retention",
    blocks: [
      p(
        "We retain information for as long as reasonably necessary to provide Varoom's services, maintain account and transaction records, resolve disputes, prevent abuse and fraud, maintain security, and comply with applicable legal obligations."
      ),
      p(
        "When information is no longer reasonably required, we may delete or anonymize it, subject to applicable legal and operational requirements."
      ),
    ],
  },
  {
    id: "international-transfers",
    title: "International Transfers",
    blocks: [
      p(
        "Some of our service providers operate servers outside Kenya, so your information may be processed in other countries. Where the law requires, we take steps to make sure your information receives appropriate protection when it is transferred."
      ),
    ],
  },
  {
    id: "your-rights",
    title: "Your Choices and Rights",
    blocks: [
      p("Under applicable law, including the Kenya Data Protection Act, 2019, you may have the right to:"),
      ul(
        "Be informed about how your personal information is used",
        "Request access to the personal information we hold about you",
        "Request correction of inaccurate or misleading information",
        "Request deletion of your personal information",
        "Object to certain processing of your personal information",
        "Request a copy of your data in a portable format, where applicable",
        "Withdraw consent you previously gave"
      ),
      p(
        "To make a request, contact ",
        mail,
        ". We may need to verify your identity first, and we will respond within the timeframes required by applicable law."
      ),
      p(
        "You also have the right to lodge a complaint with the Office of the Data Protection Commissioner (ODPC) in Kenya. We encourage you to contact us first so we can try to resolve your concern."
      ),
    ],
  },
  {
    id: "account-deletion",
    title: "Account Deletion",
    blocks: [
      p("You may request deletion of your Varoom account by contacting ", mail, " or ", support, "."),
      p(
        "When an account deletion request is accepted, we will take reasonable steps to delete or anonymize associated personal information, subject to information we are required or permitted to retain for legal, security, fraud-prevention, dispute-resolution, or legitimate operational purposes."
      ),
    ],
  },
  {
    id: "childrens-privacy",
    title: "Children's Privacy",
    blocks: [
      p(
        "Varoom is not intended for children who are below the minimum age permitted to use the service under applicable law. We do not knowingly collect personal information from children in violation of applicable law."
      ),
      p(
        "If you believe a child has given us personal information, contact ",
        mail,
        " and we will take reasonable steps to delete it."
      ),
    ],
  },
  {
    id: "third-party-services",
    title: "Third-Party Services",
    blocks: [
      p(
        "Varoom relies on third-party services for authentication, database and file storage, hosting, email delivery, payments, maps, AI features, analytics, and security, including providers such as Google, Supabase, Vercel, and Render. These providers process information on Varoom's behalf as necessary to provide their services and under their own privacy terms."
      ),
      p(
        "Varoom may contain links to other websites. We are not responsible for the privacy practices of those sites, so please review their policies."
      ),
    ],
  },
  {
    id: "changes-to-this-policy",
    title: "Changes to This Privacy Policy",
    blocks: [
      p("We may update this Privacy Policy as Varoom's features, services, or data practices change."),
      p(
        "When we make changes, we will update the \"Last updated\" date at the top of this policy. For material changes, we may also notify you in the app or by email."
      ),
    ],
  },
  {
    id: "contact-us",
    title: "Contact Us",
    blocks: [
      p("If you have questions about this Privacy Policy or how your information is handled, we are happy to help."),
      {
        type: "contact",
        title: "Varoom",
        lines: [
          ["Privacy and data requests: ", mail],
          ["General support: ", support],
          ["Website: ", { text: "varoom.co.ke", href: "https://varoom.co.ke" }],
        ],
      },
    ],
  },
];
