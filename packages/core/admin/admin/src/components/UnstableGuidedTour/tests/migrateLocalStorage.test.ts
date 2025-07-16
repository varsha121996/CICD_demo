import { type State } from '../Context';
import { type Tours } from '../Tours';
import { migrateLocalStorage } from '../utils/migrateLocalStorage';

describe('migrateLocalStorage', () => {
  const mockCurrentTours: Tours = {
    contentTypeBuilder: {
      Introduction: () => null,
      CollectionTypes: () => null,
      SingleTypes: () => null,
      Components: () => null,
      Finish: () => null,
    },
    contentManager: {
      Introduction: () => null,
      Fields: () => null,
      Publish: () => null,
      Finish: () => null,
    },
    apiTokens: {
      Introduction: () => null,
      CreateAnAPIToken: () => null,
      CopyAPIToken: () => null,
      Finish: () => null,
    },
    strapiCloud: {},
  };

  const mockStoredState: State = {
    tours: {
      contentTypeBuilder: {
        currentStep: 1,
        length: 2,
        isCompleted: false,
      },
      contentManager: {
        currentStep: 2,
        length: 2,
        isCompleted: true,
      },
      apiTokens: {
        currentStep: 0,
        length: 1,
        isCompleted: false,
      },
      strapiCloud: {
        currentStep: 0,
        length: 0,
        isCompleted: false,
      },
    },
    enabled: true,
    completedActions: ['didCreateContentTypeSchema', 'didCreateContent'],
  };

  it('should preserve existing tour state when tour structure unchanged', () => {
    const result = migrateLocalStorage(mockStoredState, mockCurrentTours);

    expect(result.tours.contentTypeBuilder).toEqual({
      currentStep: 1,
      length: 5,
      isCompleted: false,
    });
    expect(result.tours.contentManager).toEqual({
      currentStep: 2,
      length: 4,
      isCompleted: false,
    });
  });

  it('should handle new tours by adding them with default state', () => {
    const storedStateWithoutSomeTours: State = {
      // @ts-expect-error it's a mock
      tours: {
        contentTypeBuilder: mockStoredState.tours.contentTypeBuilder,
        // missing contentManager, apiTokens, strapiCloud
      },
      enabled: true,
      completedActions: [],
    };

    const result = migrateLocalStorage(storedStateWithoutSomeTours, mockCurrentTours);

    expect(result.tours.contentManager).toEqual({
      currentStep: 0,
      length: 4,
      isCompleted: false,
    });
    expect(result.tours.apiTokens).toEqual({
      currentStep: 0,
      length: 4,
      isCompleted: false,
    });
    expect(result.tours.strapiCloud).toEqual({
      currentStep: 0,
      length: 0,
      isCompleted: false,
    });
  });

  it('should remove tours that no longer exist', () => {
    const storedStateWithExtraTours: State = {
      tours: {
        ...mockStoredState.tours,
        // @ts-expect-error it's a mock
        extraTour: {
          currentStep: 1,
          length: 2,
          isCompleted: false,
        },
      },
      enabled: true,
      completedActions: [],
    };

    const result = migrateLocalStorage(storedStateWithExtraTours, mockCurrentTours);

    // @ts-expect-error it's a mock
    expect(result.tours.extraTour).toBeUndefined();
    expect(result.tours.contentTypeBuilder).toBeDefined();
    expect(result.tours.contentManager).toBeDefined();
    expect(result.tours.apiTokens).toBeDefined();
    expect(result.tours.strapiCloud).toBeDefined();
  });

  it('should update tour length when steps are added', () => {
    const result = migrateLocalStorage(mockStoredState, mockCurrentTours);

    // contentTypeBuilder had 2 steps, now has 5
    expect(result.tours.contentTypeBuilder).toEqual({
      currentStep: 1,
      length: 5,
      isCompleted: false,
    });
  });

  it('should adjust currentStep when tour becomes shorter', () => {
    const storedStateWithHighCurrentStep: State = {
      ...mockStoredState,
      tours: {
        ...mockStoredState.tours,
        contentTypeBuilder: {
          currentStep: 10, // Very high step
          length: 5,
          isCompleted: false,
        },
      },
    };

    const result = migrateLocalStorage(storedStateWithHighCurrentStep, mockCurrentTours);

    // currentStep should be adjusted to max valid step (length - 1)
    expect(result.tours.contentTypeBuilder).toEqual({
      currentStep: 4,
      length: 5,
      isCompleted: false,
    });
  });

  it('should handle tours with 0 steps', () => {
    const result = migrateLocalStorage(mockStoredState, mockCurrentTours);

    expect(result.tours.strapiCloud).toEqual({
      currentStep: 0,
      length: 0,
      isCompleted: false,
    });
  });

  it('should reset completion status when tour structure changes significantly', () => {
    const storedState: State = {
      tours: {
        contentTypeBuilder: mockStoredState.tours.contentTypeBuilder,
        contentManager: {
          currentStep: 2,
          length: 2,
          isCompleted: true,
        },
        apiTokens: mockStoredState.tours.apiTokens,
        strapiCloud: mockStoredState.tours.strapiCloud,
      },
      enabled: true,
      completedActions: [],
    };

    const result = migrateLocalStorage(storedState, mockCurrentTours);

    expect(result.tours.contentManager).toEqual({
      currentStep: 2,
      length: 4,
      isCompleted: false,
    });
  });

  it('should preserve completion status when tour length matches completed step', () => {
    const storedState: State = {
      tours: {
        contentTypeBuilder: mockStoredState.tours.contentTypeBuilder,
        contentManager: {
          currentStep: 3,
          length: 4,
          isCompleted: true,
        },
        apiTokens: mockStoredState.tours.apiTokens,
        strapiCloud: mockStoredState.tours.strapiCloud,
      },
      enabled: true,
      completedActions: [],
    };

    const result = migrateLocalStorage(storedState, mockCurrentTours);

    expect(result.tours.contentManager).toEqual({
      currentStep: 3,
      length: 4,
      isCompleted: true,
    });
  });

  it('should preserve enabled state and completedActions', () => {
    const result = migrateLocalStorage(mockStoredState, mockCurrentTours);

    expect(result.enabled).toBe(true);
    expect(result.completedActions).toEqual(['didCreateContentTypeSchema', 'didCreateContent']);
  });

  it('should handle edge case where currentStep is negative', () => {
    const storedState: State = {
      tours: {
        contentTypeBuilder: {
          currentStep: -1,
          length: 2,
          isCompleted: false,
        },
        contentManager: mockStoredState.tours.contentManager,
        apiTokens: mockStoredState.tours.apiTokens,
        strapiCloud: mockStoredState.tours.strapiCloud,
      },
      enabled: true,
      completedActions: [],
    };

    const result = migrateLocalStorage(storedState, mockCurrentTours);

    expect(result.tours.contentTypeBuilder.currentStep).toBe(0);
  });

  it('should handle multiple simultaneous changes', () => {
    const result = migrateLocalStorage(mockStoredState, mockCurrentTours);

    expect(result.tours.contentTypeBuilder).toEqual({
      currentStep: 1,
      length: 5,
      isCompleted: false,
    });

    expect(result.tours.contentManager).toEqual({
      currentStep: 2,
      length: 4,
      isCompleted: false,
    });

    expect(result.tours.apiTokens).toEqual({
      currentStep: 0,
      length: 4,
      isCompleted: false,
    });

    expect(result.tours.strapiCloud).toEqual({
      currentStep: 0,
      length: 0,
      isCompleted: false,
    });
  });
});
