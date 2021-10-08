/** ... */
export interface AutoCloseTagsConfig {
  enabledFileTypes: string[];
  selfCloseTags: string[];
  addSlashToSelfCloseTag: boolean;
  slashTriggerAutoClose: boolean;
  insertWhitespaceOnClose: boolean;
}

/** Default `auto-close-tags` configuration. */
export const config = {
  enabledFileTypes: ['html'],
  selfCloseTags: ['br', 'img', 'hr'],
  addSlashToSelfCloseTag: true,
  slashTriggerAutoClose: true,
  insertWhitespaceOnClose: true
};
