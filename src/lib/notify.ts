// The Pharmacy — transactional email notifications.
//
// Provider: Resend (https://resend.com) via plain fetch — no SDK needed.
//   1. Create a free Resend account, verify your domain (or use the
//      onboarding@resend.dev sandbox sender for testing).
//   2. Set RESEND_API_KEY and (optionally) EMAIL_FROM in the environment.
// Without a key every call degrades to a console.info no-op — the app never
// depends on email being configured to place or update an order.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const FROM = process.env.EMAIL_FROM || "The Pharmacy <onboarding@resend.dev>";

const BRAND = "#0d9488";

export const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  pending: { en: "Pending", ar: "قيد الانتظار" },
  confirmed: { en: "Confirmed", ar: "تم التأكيد" },
  preparing: { en: "Being prepared", ar: "جارٍ التحضير" },
  out_for_delivery: { en: "Out for delivery", ar: "خرج للتوصيل" },
  delivered: { en: "Delivered", ar: "تم التوصيل" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
};

interface MailItem {
  nameEn: string;
  nameAr: string;
  price: number;
  quantity: number;
}

interface MailOrder {
  orderNumber: string;
  status?: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  zone?: string | null;
  address?: string | null;
  items: MailItem[];
}

async function sendEmail(to: string | null | undefined, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[notify] email skipped (RESEND_API_KEY not set) — "${subject}"`);
    return false;
  }
  if (!to) {
    console.info(`[notify] email skipped (no recipient) — "${subject}"`);
    return false;
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error("[notify] resend error", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[notify] email failed", e);
    return false;
  }
}

function itemsTable(items: MailItem[]): string {
  const rows = items
    .map(
      (it) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${it.nameAr} — ${it.nameEn}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">×${it.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:left;direction:ltr;">${it.price.toFixed(2)} EGP</td>
      </tr>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
    <thead><tr style="background:#f1f5f9;">
      <th style="padding:8px 12px;text-align:right;">المنتج / Product</th>
      <th style="padding:8px 12px;">Qty</th>
      <th style="padding:8px 12px;text-align:left;">Price</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function layout(titleAr: string, titleEn: string, bodyHtml: string): string {
  return `<!doctype html><html dir="rtl" lang="ar"><body style="font-family:Tahoma,Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:${BRAND};padding:20px 24px;">
        <div style="color:#ffffff;font-weight:bold;font-size:18px;">ذا فارميسي · The Pharmacy</div>
        <div style="color:#ccfbf1;font-size:13px;margin-top:4px;">Egypt's Smartest Online Pharmacy</div>
      </div>
      <div style="padding:24px;">
        <h1 style="margin:0 0 4px;font-size:18px;color:#0f172a;">${titleAr}</h1>
        <p style="margin:0 0 12px;font-size:13px;color:#64748b;direction:ltr;text-align:right;">${titleEn}</p>
        ${bodyHtml}
      </div>
      <div style="padding:14px 24px;background:#f1f5f9;color:#94a3b8;font-size:11px;text-align:center;">
        © The Pharmacy — ذا فارميسي · Cairo, Egypt
      </div>
    </div>
  </body></html>`;
}

const money = (n: number) => `${n.toFixed(2)} EGP`;

/** Order confirmation — sent right after checkout succeeds. */
export async function sendOrderConfirmation(order: MailOrder, to?: string | null): Promise<boolean> {
  const body = `
    <p style="font-size:14px;color:#334155;">تم استلام طلبك بنجاح وسيتم التواصل معك قريباً للتأكيد.<br/>
    <span style="direction:ltr;unicode-bidi:embed;display:inline-block;">Your order has been received and we will contact you shortly to confirm.</span></p>
    <div style="background:#f0fdfa;border:1px solid ${BRAND}33;border-radius:12px;padding:12px 16px;margin:12px 0;">
      <div style="font-size:13px;color:#0f766e;">رقم الطلب / Order number:
        <b style="direction:ltr;unicode-bidi:embed;">${order.orderNumber}</b></div>
      <div style="font-size:13px;color:#0f766e;margin-top:4px;">الإجمالي / Total:
        <b style="direction:ltr;unicode-bidi:embed;">${money(order.total)}</b> — الدفع عند الاستلام (COD)</div>
    </div>
    ${itemsTable(order.items)}
    <div style="font-size:13px;color:#334155;text-align:left;direction:ltr;">
      Subtotal: ${money(order.subtotal)}<br/>
      Delivery: ${order.deliveryFee === 0 ? "FREE 🎉" : money(order.deliveryFee)}<br/>
      <b>Total: ${money(order.total)}</b>
    </div>`;
  const html = layout(
    "شكراً لطلبك! 🎉",
    `Order ${order.orderNumber} confirmed`,
    body
  );
  return sendEmail(
    to || undefined,
    `طلبك ${order.orderNumber} وصلنا! — Order ${order.orderNumber} received`,
    html
  );
}

/** Status update — sent when an admin moves an order forward. */
export async function sendOrderStatusUpdate(order: MailOrder, to?: string | null): Promise<boolean> {
  const st = STATUS_LABELS[order.status || ""] || { en: order.status || "", ar: order.status || "" };
  const body = `
    <p style="font-size:14px;color:#334155;">تحديث حالة طلبك: <b style="color:${BRAND};">${st.ar}</b><br/>
    <span style="direction:ltr;unicode-bidi:embed;display:inline-block;">Your order status is now: <b>${st.en}</b></span></p>
    <div style="font-size:13px;color:#0f766e;">رقم الطلب / Order:
      <b style="direction:ltr;unicode-bidi:embed;">${order.orderNumber}</b> — ${money(order.total)}</div>`;
  const html = layout("تحديث طلبك", `Order ${order.orderNumber} — ${st.en}`, body);
  return sendEmail(
    to || undefined,
    `طلبك ${order.orderNumber}: ${st.ar} — ${st.en}`,
    html
  );
}
