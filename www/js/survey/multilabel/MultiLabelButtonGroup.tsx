/* A group of stacked buttons that display inferred and confirmed labels.
  In the default configuration, these are the "Mode" and "Purpose" buttons.
  Next to the buttons is a small checkmark icon, which marks inferrel labels as confirmed */

import React, { useContext, useEffect, useState, useMemo } from 'react';
import { View, Modal, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import {
  IconButton,
  Text,
  Dialog,
  useTheme,
  RadioButton,
  Button,
  TextInput,
} from 'react-native-paper';
import DiaryButton from '../../components/DiaryButton';
import { useTranslation } from 'react-i18next';
import LabelTabContext, { UserInputMap } from '../../diary/LabelTabContext';
import { displayErrorMsg, logDebug } from '../../plugin/logger';
import {
  getLabelInputDetails,
  getLabelInputs,
  inferFinalLabels,
  labelInputDetailsForTrip,
  labelKeyToReadable,
  labelKeyToRichMode,
  readableLabelToKey,
  verifiabilityForTrip,
} from './confirmHelper';
import useAppConfig from '../../useAppConfig';
import { MultilabelKey } from '../../types/labelTypes';

const MultilabelButtonGroup = ({ trip, buttonsInline = false }) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const appConfig = useAppConfig();
  const { labelOptions, labelFor, userInputFor, addUserInputToEntry } = useContext(LabelTabContext);
  const { height: windowHeight } = useWindowDimensions();

  // modal visible for which input type? (MODE or PURPOSE or REPLACED_MODE, null if not visible)
  const [modalVisibleFor, setModalVisibleFor] = useState<MultilabelKey | null>(null);
  const [otherLabel, setOtherLabel] = useState<string | null>(null);
  const chosenLabel = useMemo<string | null>(() => {
    if (modalVisibleFor == null) return null;
    if (otherLabel != null) return 'other';
    return labelFor(trip, modalVisibleFor)?.value || null;
  }, [modalVisibleFor, otherLabel]);

  // to mark 'inferred' labels as 'confirmed'; turn yellow labels blue
  function verifyTrip() {
    const inferredLabelsForTrip = inferFinalLabels(trip, userInputFor(trip));
    let labelsToStore;
    for (const inputType of getLabelInputs()) {
      const inferred = inferredLabelsForTrip?.[inputType];
      // if there is an inferred label that is not already confirmed, confirm it by storing it
      if (inferred?.value && !labelFor(trip, inputType)) {
        labelsToStore = { ...labelsToStore, [inputType]: inferred.value };
      }
    }
    if (labelsToStore) store(labelsToStore);
  }

  function onChooseLabel(chosenValue) {
    if (!modalVisibleFor) return displayErrorMsg('Cannot choose label when modal not visible');
    logDebug(`onChooseLabel with chosen ${modalVisibleFor} as ${chosenValue}`);
    if (chosenValue == 'other') {
      setOtherLabel('');
    } else {
      store({ [modalVisibleFor]: chosenValue });
    }
  }

  function dismiss() {
    setModalVisibleFor(null);
    setOtherLabel(null);
  }

  /* Store a batch of one or more inputs to the user cache, dismiss the popup if it was visible,
    and inform LabelTab of new inputs */
  function store(inputs: { [k in MultilabelKey]?: string }, isOther?) {
    if (!Object.keys(inputs).length) return displayErrorMsg('No inputs to store');
    const inputsToStore: UserInputMap = {};
    const storePromises: any[] = [];
    for (let [inputType, chosenLabel] of Object.entries(inputs)) {
      if (isOther) {
        /* Let's make the value for user entered inputs look consistent with our other values
        (i.e. lowercase, and with underscores instead of spaces) */
        chosenLabel = readableLabelToKey(chosenLabel);
      }
      const inputDataToStore = {
        start_ts: trip.start_ts,
        end_ts: trip.end_ts,
        label: chosenLabel,
      };
      inputsToStore[inputType] = inputDataToStore;

      const storageKey = getLabelInputDetails()[inputType].key;
      storePromises.push(
        window['cordova'].plugins.BEMUserCache.putMessage(storageKey, inputDataToStore),
      );
    }
    Promise.all(storePromises).then(() => {
      logDebug('Successfully stored input data ' + JSON.stringify(inputsToStore));
      dismiss();
      addUserInputToEntry(trip._id.$oid, inputsToStore, 'label');
    });
  }

  const tripInputDetails = labelInputDetailsForTrip(userInputFor(trip), appConfig);
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, flexDirection: buttonsInline ? 'row' : 'column', columnGap: 8 }}>
          {Object.keys(tripInputDetails).map((key, i) => {
            const input = tripInputDetails[key];
            const inputIsConfirmed = labelFor(trip, input.name);
            const inputIsInferred = inferFinalLabels(trip, userInputFor(trip))[input.name];
            let fillColor, textColor, borderColor;
            if (inputIsConfirmed) {
              fillColor = colors.primary;
            } else if (inputIsInferred) {
              fillColor = colors.secondaryContainer;
              borderColor = colors.secondary;
              textColor = colors.onSecondaryContainer;
            }
            const btnText = inputIsConfirmed?.text || inputIsInferred?.text || input.choosetext;

            return (
              <View key={i} style={{ flex: 1 }}>
                <Text>{t(input.labeltext)}</Text>
                <DiaryButton
                  fillColor={fillColor}
                  borderColor={borderColor}
                  textColor={textColor}
                  onPress={(e) => setModalVisibleFor(input.name)}>
                  {t(btnText)}
                </DiaryButton>
              </View>
            );
          })}
        </View>
        {verifiabilityForTrip(trip, userInputFor(trip)) == 'can-verify' && (
          <View style={{ marginTop: 16 }}>
            <IconButton
              icon="check-bold"
              mode="outlined"
              size={18}
              onPress={verifyTrip}
              containerColor={colors.secondaryContainer}
              style={{ width: 24, height: 24, margin: 3, borderColor: colors.secondary }}
            />
          </View>
        )}
      </View>
      <Modal visible={modalVisibleFor != null} transparent={true} onDismiss={() => dismiss()}>
        <Dialog visible={modalVisibleFor != null} onDismiss={() => dismiss()}>
          <Pressable>
            <Dialog.Title style={{ elevation: 2 }}>
              {(modalVisibleFor == 'MODE' && t('diary.select-mode-scroll')) ||
                (modalVisibleFor == 'PURPOSE' && t('diary.select-purpose-scroll')) ||
                (modalVisibleFor == 'REPLACED_MODE' && t('diary.select-replaced-mode-scroll'))}
            </Dialog.Title>
            <Dialog.Content style={{ maxHeight: windowHeight / 2, paddingBottom: 0 }}>
              <ScrollView style={{ paddingBottom: 24 }}>
                <RadioButton.Group
                  onValueChange={(val) => onChooseLabel(val)}
                  value={chosenLabel || ''}>
                  {modalVisibleFor &&
                    labelOptions?.[modalVisibleFor]?.map((o, i) => (
                      <RadioButton.Item
                        key={i}
                        label={o.text || labelKeyToReadable(o.value)}
                        value={o.value}
                        style={{ paddingVertical: 2 }}
                      />
                    ))}
                </RadioButton.Group>
              </ScrollView>
            </Dialog.Content>
            {otherLabel != null && modalVisibleFor != null && (
              <>
                <TextInput
                  label={t('trip-confirm.services-please-fill-in', {
                    text: modalVisibleFor?.toLowerCase(),
                  })}
                  value={otherLabel || ''}
                  onChangeText={(t) => setOtherLabel(t)}
                />
                <Dialog.Actions>
                  <Button onPress={() => store({ [modalVisibleFor]: otherLabel }, true)}>
                    {t('trip-confirm.services-save')}
                  </Button>
                </Dialog.Actions>
              </>
            )}
          </Pressable>
        </Dialog>
      </Modal>
    </>
  );
};

export default MultilabelButtonGroup;
