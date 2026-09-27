export const CATALOGUE_CURRENCY = "USD";

export type Guide = {
  id: string;
  slug: string;
  title: string;
  description: string;
  longDescription: string;
  isActive: boolean;
  currentVersion: number;
  priceInCents: number;
  includedFiles: string[];
};

export type Bundle = {
  id: string;
  slug: string;
  title: string;
  description: string;
  priceInCents: number;
  includedGuideIds: string[];
};

export const GUIDES: readonly Guide[] = [
  {
    id: "ad9e6a4b-fbf4-4a65-8a3b-118cb7dfdb75",
    slug: "first-month-home-setup",
    title: "First 30 Days in Your New Home",
    description: "A practical checklist for your first month of homeownership.",
    longDescription:
      "Use this guide to organize the tasks that matter immediately after closing, from securing entry points to locating home systems and setting up essential services.",
    isActive: true,
    currentVersion: 1,
    priceInCents: 1200,
    includedFiles: ["PDF guide", "editable checklist"],
  },
  {
    id: "65552c2c-ec08-4aa8-9d60-e5d9e9451daf",
    slug: "first-year-home-maintenance",
    title: "First Year Home Maintenance System",
    description: "Plan the routines that keep your home in good condition.",
    longDescription:
      "Build a realistic maintenance rhythm for the first year, with a clear tracker for recurring tasks and seasonal checks.",
    isActive: true,
    currentVersion: 1,
    priceInCents: 2400,
    includedFiles: ["PDF guide", "maintenance tracker"],
  },
  {
    id: "c647987e-3eba-4da7-bd6e-3313d2aaf518",
    slug: "home-emergency-binder",
    title: "Home Safety and Emergency Binder",
    description: "Keep emergency information and home safety plans together.",
    longDescription:
      "Create one dependable place for emergency contacts, household safety details, shutoff information, and important response plans.",
    isActive: true,
    currentVersion: 1,
    priceInCents: 1500,
    includedFiles: ["PDF binder", "editable worksheet"],
  },
  {
    id: "e8507a23-4892-4cf1-8fa8-5dd386498e30",
    slug: "homeowner-budget-repair",
    title: "Homeowner Budget and Repair Planner",
    description: "Prepare for regular costs and unexpected repairs.",
    longDescription:
      "Plan ownership costs, set aside a repair reserve, and use editable worksheets to make repair decisions with a clearer picture of your budget.",
    isActive: true,
    currentVersion: 1,
    priceInCents: 1900,
    includedFiles: ["PDF planner", "budget workbook"],
  },
  {
    id: "32e97c48-0bf1-4259-9cf4-9f83b49d415d",
    slug: "contractor-hiring-home-repair",
    title: "Contractor Hiring and Home Repair Toolkit",
    description: "Make confident decisions before starting home repairs.",
    longDescription:
      "Use practical prompts and editable comparison tools to define work, assess quotes, and keep a home repair project organized.",
    isActive: true,
    currentVersion: 1,
    priceInCents: 1900,
    includedFiles: ["PDF toolkit", "project workbook"],
  },
  {
    id: "8ae0b95f-2d4d-46b8-8d8e-9e71c4b7e85e",
    slug: "home-renovation-improvement",
    title: "Home Renovation and Improvement Planner",
    description: "Turn an improvement idea into a manageable plan.",
    longDescription:
      "Turn an improvement idea into a prioritized, budget-aware plan before committing to renovation work or contractor conversations.",
    isActive: true,
    currentVersion: 1,
    priceInCents: 2400,
    includedFiles: ["PDF planner", "renovation workbook"],
  },
  {
    id: "7ad05bc0-6252-418c-bb0a-95ce70eeb81b",
    slug: "home-records-warranty",
    title: "Home Records and Warranty Organizer",
    description: "Organize the records that make future repairs simpler.",
    longDescription:
      "Keep appliance, warranty, service, and household records organized so important information is ready when you need it.",
    isActive: true,
    currentVersion: 1,
    priceInCents: 1500,
    includedFiles: ["PDF organizer", "warranty tracker"],
  },
  {
    id: "4a4478d7-fd4b-43e6-ab98-bdb655fc502f",
    slug: "seasonal-home-care",
    title: "Seasonal Home Care Pack",
    description: "Stay ahead of seasonal tasks throughout the year.",
    longDescription:
      "Follow a practical seasonal routine that helps you prepare your home for changing weather and prevent overlooked maintenance tasks.",
    isActive: true,
    currentVersion: 1,
    priceInCents: 1500,
    includedFiles: ["PDF guide", "seasonal tracker"],
  },
] as const;

export const COMPLETE_SET: Bundle = {
  id: "8cb5cf9e-ffb4-42d9-84d5-b0bbc4d1bd38",
  slug: "complete-new-homeowner-system",
  title: "Complete New Homeowner System",
  description: "All eight homeowner guides and their editable workbooks.",
  priceInCents: 6900,
  includedGuideIds: GUIDES.map((guide) => guide.id),
};

export const ALL_PRODUCT_IDS = new Set([
  ...GUIDES.map((guide) => guide.id),
  COMPLETE_SET.id,
]);

export function findGuideBySlug(slug: string) {
  return GUIDES.find((guide) => guide.slug === slug);
}

export function formatPrice(priceInCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: CATALOGUE_CURRENCY,
    maximumFractionDigits: 0,
  }).format(priceInCents / 100);
}
