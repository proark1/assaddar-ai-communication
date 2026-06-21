import { createDbClient } from "./client";
import { TenantRepository } from "./repository";

async function main() {
  const client = createDbClient();
  try {
    const repo = new TenantRepository(client.db);
    const existing = await repo.getTenantBySlug("demo-business");
    const tenant =
      existing ??
      (await repo.createTenant({
        name: "Demo Business",
        slug: "demo-business",
        theme: {
          primaryColor: "#155eef",
          backgroundColor: "#ffffff",
          textColor: "#172033",
          openingMessage: "Hi, I can answer questions from Demo Business knowledge."
        }
      }));

    const knowledge = await repo.listKnowledge(tenant.id);
    if (knowledge.length === 0) {
      await repo.addFaq(tenant.id, {
        question: "What are your opening hours?",
        answer: "Demo Business is open Monday to Friday from 09:00 to 18:00.",
        tags: ["opening-hours", "faq"]
      });
      await repo.addFaq(tenant.id, {
        question: "Which services do you offer?",
        answer: "Demo Business offers AI communication setup, website chatbot integration, WhatsApp automation planning, and voice AI prototypes.",
        tags: ["services", "faq"]
      });
      await repo.addFaq(tenant.id, {
        question: "How can a customer reach a human?",
        answer: "Customers can leave a message in chat, and the team will follow up by email or phone.",
        tags: ["handoff", "faq"]
      });
    }

    console.log("Seed tenant ready:");
    console.log(`  tenant_id: ${tenant.id}`);
    console.log(`  public_assistant_id: ${tenant.publicId}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
