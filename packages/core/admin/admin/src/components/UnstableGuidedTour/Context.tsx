import * as React from 'react';

import { produce } from 'immer';

import { GetGuidedTourMeta } from '../../../../shared/contracts/admin';
import { usePersistentState } from '../../hooks/usePersistentState';
import { createContext } from '../Context';

import { type Tours, tours as guidedTours } from './Tours';

/* -------------------------------------------------------------------------------------------------
 * GuidedTourProvider
 * -----------------------------------------------------------------------------------------------*/

type ValidTourName = keyof Tours;

export type ExtendedCompletedActions = (
  | GetGuidedTourMeta.Response['data']['completedActions'][number]
  | 'didCopyApiToken'
)[];

type Action =
  | {
      type: 'next_step';
      payload: ValidTourName;
    }
  | {
      type: 'skip_tour';
      payload: ValidTourName;
    }
  | {
      type: 'set_completed_actions';
      payload: ExtendedCompletedActions;
    }
  | {
      type: 'skip_all_tours';
    };

type Tour = Record<ValidTourName, { currentStep: number; length: number; isCompleted: boolean }>;
type State = {
  tours: Tour;
  enabled: boolean;
  completedActions: ExtendedCompletedActions;
};

const [GuidedTourProviderImpl, unstableUseGuidedTour] = createContext<{
  state: State;
  dispatch: React.Dispatch<Action>;
}>('UnstableGuidedTour');

function updateTourStepsBasedOnActions(draft: State, actions: ExtendedCompletedActions): void {
  const hasAction = (action: string) =>
    actions.includes(action as ExtendedCompletedActions[number]);

  // Content Type Builder logic
  const hasSchema = hasAction('didCreateContentTypeSchema');
  const hasContent = hasAction('didCreateContent');

  if (hasSchema && hasContent) {
    // Complete contentTypeBuilder when both schema and content are created
    draft.tours.contentTypeBuilder.currentStep = draft.tours.contentTypeBuilder.length;
    draft.tours.contentTypeBuilder.isCompleted = true;
  } else if (hasSchema) {
    // Set to last step when only schema is created
    draft.tours.contentTypeBuilder.currentStep = draft.tours.contentTypeBuilder.length - 1;
  }

  // Content Manager logic
  const hasApiToken = hasAction('didCreateApiToken');

  if (hasContent && hasApiToken) {
    // Complete contentManager when both content and API token are created
    draft.tours.contentManager.currentStep = draft.tours.contentManager.length;
    draft.tours.contentManager.isCompleted = true;
  } else if (hasContent) {
    // Set to last step when only content is created
    draft.tours.contentManager.currentStep = draft.tours.contentManager.length - 1;
  }

  // API Tokens logic
  const hasCopiedApiToken = hasAction('didCopyApiToken');

  if (hasApiToken && hasCopiedApiToken) {
    // Complete apiTokens when both API token is created and copied
    draft.tours.apiTokens.currentStep = draft.tours.apiTokens.length;
  }
}

function reducer(state: State, action: Action): State {
  return produce(state, (draft) => {
    if (action.type === 'next_step') {
      const nextStep = draft.tours[action.payload].currentStep + 1;
      draft.tours[action.payload].currentStep = nextStep;
      draft.tours[action.payload].isCompleted = nextStep === draft.tours[action.payload].length;
    }

    if (action.type === 'skip_tour') {
      draft.tours[action.payload].isCompleted = true;
    }

    if (action.type === 'set_completed_actions') {
      draft.completedActions = [...new Set([...draft.completedActions, ...action.payload])];
      updateTourStepsBasedOnActions(draft, action.payload);
    }

    if (action.type === 'skip_all_tours') {
      draft.enabled = false;
    }
  });
}

const STORAGE_KEY = 'STRAPI_GUIDED_TOUR';

const UnstableGuidedTourContext = ({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) => {
  const initialTourState = Object.keys(guidedTours).reduce((acc, tourName) => {
    const tourLength = Object.keys(guidedTours[tourName as ValidTourName]).length;
    acc[tourName as ValidTourName] = {
      currentStep: 0,
      length: tourLength,
      isCompleted: false,
    };

    return acc;
  }, {} as Tour);

  const [tours, setTours] = usePersistentState<State>(STORAGE_KEY, {
    tours: initialTourState,
    enabled,
    completedActions: [],
  });
  const [state, dispatch] = React.useReducer(reducer, tours);

  // Sync local storage
  React.useEffect(() => {
    if (window.strapi.future.isEnabled('unstableGuidedTour')) {
      setTours(state);
    }
  }, [state, setTours]);

  return (
    <GuidedTourProviderImpl state={state} dispatch={dispatch}>
      {children}
    </GuidedTourProviderImpl>
  );
};

export type { Action, State, ValidTourName };
export { UnstableGuidedTourContext, unstableUseGuidedTour, reducer, updateTourStepsBasedOnActions };
