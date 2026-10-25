/**
 * Placeholder FAQ content for the /faq page and the product-page "Frequently asked questions" block.
 * These are dummy questions and answers written so the layout can be reviewed — replace them with the
 * store's real policies (shipping times, return window, warranty) before launch. `popular` entries are the
 * ones shown first (the product page shows the first 6 popular ones).
 */
export type FaqCategory = "Orders" | "Shipping" | "Returns & Refunds" | "Payments" | "Fitment & Installation" | "Products";

export interface FaqItem {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  popular?: boolean;
}

export const FAQ_CATEGORIES: FaqCategory[] = ["Orders", "Shipping", "Returns & Refunds", "Payments", "Fitment & Installation", "Products"];

export const faqs: FaqItem[] = [
  {
    id: "fit-my-car",
    category: "Fitment & Installation",
    question: "How do I know if an accessory will fit my car or bike?",
    answer:
      "Each product page lists the models it is made for. You can also use Shop by Car on the home page to see only the accessories for your model. If you are unsure, call or WhatsApp us with your vehicle model and year and we will confirm before you order.",
    popular: true,
  },
  {
    id: "delivery-time",
    category: "Shipping",
    question: "How long does delivery take?",
    answer:
      "Most orders are dispatched within 1–2 working days and arrive in 2–3 business days in Ahmedabad and 3–7 business days across India. Bulky items such as floor mats and seat covers can take a little longer.",
    popular: true,
  },
  {
    id: "return-policy",
    category: "Returns & Refunds",
    question: "What is your return and refund policy?",
    answer:
      "You can return an unused product in its original packaging within 30 days of delivery. Once we receive and check it, the refund goes back to your original payment method within 5–7 working days.",
    popular: true,
  },
  {
    id: "cod",
    category: "Payments",
    question: "Do you offer Cash on Delivery?",
    answer:
      "Yes, Cash on Delivery is available on most pin codes. You will see the option at checkout if it is available for your address. For high-value orders we may ask for a small advance payment.",
    popular: true,
  },
  {
    id: "installation",
    category: "Fitment & Installation",
    question: "Can you install the accessories for me?",
    answer:
      "At our Ahmedabad store we fit seat covers, mats, dash cams, audio systems and GPS trackers on the spot. Outside Ahmedabad most items are easy to fit yourself and come with simple instructions, and we can guide you over a call.",
    popular: true,
  },
  {
    id: "genuine",
    category: "Products",
    question: "Are your products genuine?",
    answer:
      "Yes. We have been in the business since 1969 and buy directly from the brands and their authorised distributors. Branded products carry the manufacturer's own warranty where the brand offers one.",
    popular: true,
  },
  {
    id: "track-order",
    category: "Orders",
    question: "How can I track my order?",
    answer:
      "Sign in and open My Orders to see the status of each order. Once your parcel is dispatched you will also get the courier name and tracking number by SMS or email.",
  },
  {
    id: "cancel-order",
    category: "Orders",
    question: "Can I cancel or change my order?",
    answer:
      "You can cancel or change an order any time before it is dispatched. Contact us as soon as possible with your order number and we will update it. After dispatch, you can still return it under our return policy.",
  },
  {
    id: "payment-methods",
    category: "Payments",
    question: "Which payment methods do you accept?",
    answer: "We accept UPI, debit and credit cards (Visa, Mastercard, RuPay), net banking and Cash on Delivery. All online payments are processed over a secure connection.",
  },
  {
    id: "invoice",
    category: "Payments",
    question: "Will I get a GST invoice?",
    answer: "Yes, every order comes with a GST invoice. Add your GSTIN at checkout if you need the invoice in your business name.",
  },
  {
    id: "damaged",
    category: "Returns & Refunds",
    question: "What if my product arrives damaged or is the wrong item?",
    answer:
      "Please contact us within 48 hours of delivery with a photo of the parcel and the item. We will arrange a free replacement or a full refund — you do not need to pay anything to send it back.",
  },
  {
    id: "shipping-charges",
    category: "Shipping",
    question: "Is there a delivery charge?",
    answer: "Delivery is free on orders above ₹1,499. Below that a small flat charge is shown at checkout before you pay, based on your pin code.",
  },
  {
    id: "warranty",
    category: "Products",
    question: "Do the products come with a warranty?",
    answer:
      "Electronics such as dash cams, audio systems and GPS trackers come with the brand warranty, usually 6–12 months. The warranty period is mentioned on the product page, and we help you with the claim if you need it.",
  },
  {
    id: "bulk-orders",
    category: "Orders",
    question: "Do you take bulk or dealer orders?",
    answer: "Yes. For fleet, dealer or bulk requirements please use the Contact Us page or call the store and our team will share special pricing.",
  },
];
