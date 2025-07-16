import { type State, type ValidTourName } from '../Context';
import { type Tours } from '../Tours';

/**
 * Migrates the stored tour state to match the current tour definitions.
 * This function handles cases where tours have been added, removed, or modified
 * since the user's last visit.
 */
export function migrateLocalStorage(
  storedState: State,
  currentTours: Tours
): State {
  const currentTourNames = Object.keys(currentTours) as ValidTourName[];

  // Create updated tours object
  const updatedTours = currentTourNames.reduce((acc, tourName) => {
    const currentTourLength = Object.keys(currentTours[tourName]).length;
    const storedTour = storedState.tours[tourName];

    if (storedTour) {
      // Tour exists in storage - check if it needs updating
      const lengthChanged = storedTour.length !== currentTourLength;
      const newCurrentStep = Math.min(storedTour.currentStep, currentTourLength - 1);
      const currentStepChanged = newCurrentStep !== storedTour.currentStep;
      
      if (lengthChanged || currentStepChanged) {
        // Tour structure changed or currentStep out of bounds - need to update
        const adjustedCurrentStep = Math.max(0, newCurrentStep);
        const newIsCompleted = storedTour.isCompleted && adjustedCurrentStep === currentTourLength - 1;
        
        acc[tourName] = {
          currentStep: adjustedCurrentStep,
          length: currentTourLength,
          isCompleted: newIsCompleted,
        };
      } else {
        // Tour structure unchanged - preserve existing state
        acc[tourName] = storedTour;
      }
    } else {
      // New tour - initialize with default state
      acc[tourName] = {
        currentStep: 0,
        length: currentTourLength,
        isCompleted: false,
      };
    }

    return acc;
  }, {} as State['tours']);

  // Return updated state (removed tours are automatically excluded)
  return {
    ...storedState,
    tours: updatedTours,
  };
}