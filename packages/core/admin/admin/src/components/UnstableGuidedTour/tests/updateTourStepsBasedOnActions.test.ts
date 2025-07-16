import {
  type State,
  type ExtendedCompletedActions,
  updateTourStepsBasedOnActions,
} from '../Context';

describe('updateTourStepsBasedOnActions', () => {
  const createInitialState = (): State => ({
    tours: {
      contentTypeBuilder: {
        currentStep: 0,
        isCompleted: false,
        length: 3,
      },
      contentManager: {
        currentStep: 0,
        isCompleted: false,
        length: 2,
      },
      apiTokens: {
        currentStep: 0,
        isCompleted: false,
        length: 3,
      },
      strapiCloud: {
        currentStep: 0,
        isCompleted: false,
        length: 0,
      },
    },
    enabled: true,
    completedActions: [] as ExtendedCompletedActions,
  });

  describe('Content Type Builder logic', () => {
    it('should complete contentTypeBuilder when both schema and content are created', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCreateContentTypeSchema', 'didCreateContent'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentTypeBuilder.currentStep).toBe(3);
      expect(draft.tours.contentTypeBuilder.isCompleted).toBe(true);
    });

    it('should set contentTypeBuilder to last step when only schema is created', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCreateContentTypeSchema'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentTypeBuilder.currentStep).toBe(2);
      expect(draft.tours.contentTypeBuilder.isCompleted).toBe(false);
    });

    it('should not modify contentTypeBuilder when only content is created', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCreateContent'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentTypeBuilder.currentStep).toBe(0);
      expect(draft.tours.contentTypeBuilder.isCompleted).toBe(false);
    });

    it('should not modify contentTypeBuilder when no relevant actions are present', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCreateApiToken'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentTypeBuilder.currentStep).toBe(0);
      expect(draft.tours.contentTypeBuilder.isCompleted).toBe(false);
    });
  });

  describe('Content Manager logic', () => {
    it('should complete contentManager when both content and API token are created', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCreateContent', 'didCreateApiToken'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentManager.currentStep).toBe(2);
      expect(draft.tours.contentManager.isCompleted).toBe(true);
    });

    it('should set contentManager to last step when only content is created', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCreateContent'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentManager.currentStep).toBe(1);
      expect(draft.tours.contentManager.isCompleted).toBe(false);
    });

    it('should not modify contentManager when only API token is created', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCreateApiToken'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentManager.currentStep).toBe(0);
      expect(draft.tours.contentManager.isCompleted).toBe(false);
    });

    it('should not modify contentManager when no relevant actions are present', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCopyApiToken'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentManager.currentStep).toBe(0);
      expect(draft.tours.contentManager.isCompleted).toBe(false);
    });
  });

  describe('API Tokens logic', () => {
    it('should complete apiTokens when both API token is created and copied', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCreateApiToken', 'didCopyApiToken'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.apiTokens.currentStep).toBe(3);
      expect(draft.tours.apiTokens.isCompleted).toBe(false);
    });

    it('should not modify apiTokens when only API token is created', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCreateApiToken'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.apiTokens.currentStep).toBe(0);
      expect(draft.tours.apiTokens.isCompleted).toBe(false);
    });

    it('should not modify apiTokens when only copied action is present', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCopyApiToken'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.apiTokens.currentStep).toBe(0);
      expect(draft.tours.apiTokens.isCompleted).toBe(false);
    });

    it('should not modify apiTokens when no relevant actions are present', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCreateContent'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.apiTokens.currentStep).toBe(0);
      expect(draft.tours.apiTokens.isCompleted).toBe(false);
    });
  });

  describe('Combined scenarios', () => {
    it('should handle all actions being present', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = [
        'didCreateContentTypeSchema',
        'didCreateContent',
        'didCreateApiToken',
        'didCopyApiToken',
      ];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentTypeBuilder.currentStep).toBe(3);
      expect(draft.tours.contentTypeBuilder.isCompleted).toBe(true);
      expect(draft.tours.contentManager.currentStep).toBe(2);
      expect(draft.tours.contentManager.isCompleted).toBe(true);
      expect(draft.tours.apiTokens.currentStep).toBe(3);
      expect(draft.tours.apiTokens.isCompleted).toBe(false);
    });

    it('should handle overlapping actions correctly', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['didCreateContent', 'didCreateApiToken'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentTypeBuilder.currentStep).toBe(0);
      expect(draft.tours.contentTypeBuilder.isCompleted).toBe(false);
      expect(draft.tours.contentManager.currentStep).toBe(2);
      expect(draft.tours.contentManager.isCompleted).toBe(true);
      expect(draft.tours.apiTokens.currentStep).toBe(0);
      expect(draft.tours.apiTokens.isCompleted).toBe(false);
    });

    it('should not modify strapiCloud tour', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = [
        'didCreateContentTypeSchema',
        'didCreateContent',
        'didCreateApiToken',
        'didCopyApiToken',
      ];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.strapiCloud.currentStep).toBe(0);
      expect(draft.tours.strapiCloud.isCompleted).toBe(false);
    });

    it('should preserve existing tour progress', () => {
      const draft = createInitialState();
      draft.tours.contentTypeBuilder.currentStep = 2;
      draft.tours.contentManager.currentStep = 1;
      draft.tours.apiTokens.currentStep = 2;
      draft.tours.strapiCloud.currentStep = 0;

      const actions: ExtendedCompletedActions = ['didCreateContentTypeSchema'];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentTypeBuilder.currentStep).toBe(2);
      expect(draft.tours.contentTypeBuilder.isCompleted).toBe(false);
      expect(draft.tours.contentManager.currentStep).toBe(1);
      expect(draft.tours.contentManager.isCompleted).toBe(false);
      expect(draft.tours.apiTokens.currentStep).toBe(2);
      expect(draft.tours.apiTokens.isCompleted).toBe(false);
      expect(draft.tours.strapiCloud.currentStep).toBe(0);
      expect(draft.tours.strapiCloud.isCompleted).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty actions array', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = [];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentTypeBuilder.currentStep).toBe(0);
      expect(draft.tours.contentTypeBuilder.isCompleted).toBe(false);
      expect(draft.tours.contentManager.currentStep).toBe(0);
      expect(draft.tours.contentManager.isCompleted).toBe(false);
      expect(draft.tours.apiTokens.currentStep).toBe(0);
      expect(draft.tours.apiTokens.isCompleted).toBe(false);
    });

    it('should handle duplicate actions', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = [
        'didCreateContentTypeSchema',
        'didCreateContent',
        'didCreateContent',
        'didCreateContentTypeSchema',
      ];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentTypeBuilder.currentStep).toBe(3);
      expect(draft.tours.contentTypeBuilder.isCompleted).toBe(true);
      expect(draft.tours.contentManager.currentStep).toBe(1);
      expect(draft.tours.contentManager.isCompleted).toBe(false);
    });

    it('should handle unknown actions gracefully', () => {
      const draft = createInitialState();
      const actions: ExtendedCompletedActions = ['unknownAction' as any];

      updateTourStepsBasedOnActions(draft, actions);

      expect(draft.tours.contentTypeBuilder.currentStep).toBe(0);
      expect(draft.tours.contentTypeBuilder.isCompleted).toBe(false);
      expect(draft.tours.contentManager.currentStep).toBe(0);
      expect(draft.tours.contentManager.isCompleted).toBe(false);
      expect(draft.tours.apiTokens.currentStep).toBe(0);
      expect(draft.tours.apiTokens.isCompleted).toBe(false);
    });
  });
});
