/** wa.me link to the store with an optional prefilled message. */
export const whatsappUrl = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
