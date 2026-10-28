// Placeholder notification hook. Replace the body with email, SMS or chat delivery
// if your deployment needs to alert the head of department about new activity.
export async function notifyOwner(data: { title: string; content: string }) {
  console.log(`[Notification] ${data.title}: ${data.content}`);
  return true;
}
