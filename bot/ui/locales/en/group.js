// group · en: group chats (screens/group.js)
export default {
  /** The item in the @ list that means every member; it's also what goes into the input box (src/core/groups.ts knows it) */
  everyone: "everyone",
  placeholder: "Send a message, @ someone to choose who answers",
  mentionLabel: "Choose a member to @",
  editTitle: "Group name and members",
  empty: "Whoever you @ answers. With no @, the bot that answered last carries on. Each bot uses its own model, workspace and memory.",
  /** The name shown on replies left by a bot that was deleted */
  removedBot: "Deleted bot",
  working: "{name} is answering…",
  noMessages: "No messages yet",
  sheet: {
    newTitle: "New group chat",
    editTitle: "Group name and members",
    name: "Name",
    namePlaceholder: "Leave blank to use the members' names",
    members: "Members",
    membersHint: "Pick at least two bots",
    create: "Create",
    save: "Save",
  },
  delete: {
    title: "Delete “{name}”?",
    body: "This permanently deletes the group chat and its messages. The bots and their one-on-one chats aren't affected.",
    confirm: "Delete permanently",
  },
};
