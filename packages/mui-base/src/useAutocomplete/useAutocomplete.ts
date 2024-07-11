'use client';
/* eslint-disable no-constant-condition */
import * as React from 'react';
import {
  unstable_setRef as setRef,
  unstable_useEventCallback as useEventCallback,
  unstable_useControlled as useControlled,
  unstable_useId as useId,
  usePreviousProps,
} from '@mui/utils';
import {
  AutocompleteChangeDetails,
  AutocompleteChangeDirection,
  AutocompleteChangeReason,
  AutocompleteCloseReason,
  AutocompleteFreeSoloValueMapping,
  AutocompleteGetTagProps,
  AutocompleteGroupedOption,
  AutocompleteHighlightChangeReason,
  AutocompleteValue,
  CreateFilterOptionsConfig,
  FilterOptionsState,
  UseAutocompleteProps,
  UseAutocompleteReturnValue,
} from './useAutocomplete.types';
import { MuiCancellableEvent } from '../utils/MuiCancellableEvent';

// https://stackoverflow.com/questions/990904/remove-accents-diacritics-in-a-string-in-javascript
function stripDiacritics(string: string) {
  return string.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
export function createFilterOptions<Value>(
  config: CreateFilterOptionsConfig<Value> = {},
): (options: Value[], state: FilterOptionsState<Value>) => Value[] {
  const {
    ignoreAccents = true,
    ignoreCase = true,
    limit,
    matchFrom = 'any',
    stringify,
    trim = false,
  } = config;

  return (options, { inputValue, getOptionLabel }) => {
    let input = trim ? inputValue.trim() : inputValue;
    if (ignoreCase) {
      input = input.toLowerCase();
    }
    if (ignoreAccents) {
      input = stripDiacritics(input);
    }

    const filteredOptions = !input
      ? options
      : options.filter((option) => {
          let candidate = (stringify || getOptionLabel)(option);
          if (ignoreCase) {
            candidate = candidate.toLowerCase();
          }
          if (ignoreAccents) {
            candidate = stripDiacritics(candidate);
          }

          return matchFrom === 'start'
            ? candidate.indexOf(input) === 0
            : candidate.indexOf(input) > -1;
        });

    return typeof limit === 'number' ? filteredOptions.slice(0, limit) : filteredOptions;
  };
}

const defaultFilterOptions = createFilterOptions();

// Number of options to jump in list box when `Page Up` and `Page Down` keys are used.
const pageSize = 5;

const defaultIsActiveElementInListbox = (listboxRef: React.RefObject<HTMLElement>) =>
  listboxRef.current !== null && listboxRef.current.parentElement?.contains(document.activeElement);

/**
 *
 * Demos:
 *
 * - [Autocomplete](https://next.mui.com/base-ui/react-autocomplete/#hook)
 *
 * API:
 *
 * - [useAutocomplete API](https://next.mui.com/base-ui/react-autocomplete/hooks-api/#use-autocomplete)
 */
export function useAutocomplete<
  Value,
  Multiple extends boolean | undefined = false,
  DisableClearable extends boolean | undefined = false,
  FreeSolo extends boolean | undefined = false,
>(
  props: UseAutocompleteProps<Value, Multiple, DisableClearable, FreeSolo>,
): UseAutocompleteReturnValue<Value, Multiple, DisableClearable, FreeSolo> {
  const {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    unstable_isActiveElementInListbox = defaultIsActiveElementInListbox,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    unstable_classNamePrefix = 'Mui',
    autoComplete = false,
    autoHighlight = false,
    autoSelect = false,
    blurOnSelect = false,
    clearOnBlur = !props.freeSolo,
    clearOnEscape = false,
    componentName = 'useAutocomplete',
    defaultValue = (props.multiple ? [] : null) as AutocompleteValue<
      Value,
      Multiple,
      DisableClearable,
      FreeSolo
    >,
    disableClearable = false,
    disableCloseOnSelect = false,
    disabled: disabledProp,
    disabledItemsFocusable = false,
    disableListWrap = false,
    filterOptions = defaultFilterOptions as (
      options: Value[],
      state: FilterOptionsState<Value>,
    ) => Value[],
    filterSelectedOptions = false,
    freeSolo = false,
    getOptionDisabled,
    getOptionKey,
    getOptionLabel: getOptionLabelProp = (option) => (option as { label: string }).label ?? option,
    groupBy,
    handleHomeEndKeys = !props.freeSolo,
    id: idProp,
    includeInputInList = false,
    inputValue: inputValueProp,
    isOptionEqualToValue = (option, value) => option === value,
    multiple,
    onChange,
    onClose,
    onHighlightChange,
    onInputChange,
    onOpen,
    open: openProp,
    openOnFocus = false,
    options,
    readOnly = false,
    selectOnFocus = !props.freeSolo,
    value: valueProp,
  } = props;

  const id = useId(idProp)!;

  let getOptionLabel = getOptionLabelProp;

  getOptionLabel = (option) => {
    const optionLabel = getOptionLabelProp(option);
    if (typeof optionLabel !== 'string') {
      if (process.env.NODE_ENV !== 'production') {
        const erroneousReturn =
          optionLabel === undefined ? 'undefined' : `${typeof optionLabel} (${optionLabel})`;
        console.error(
          `MUI: The \`getOptionLabel\` method of ${componentName} returned ${erroneousReturn} instead of a string for ${JSON.stringify(
            option,
          )}.`,
        );
      }
      return String(optionLabel);
    }
    return optionLabel;
  };

  const ignoreFocus = React.useRef(false);
  const firstFocus = React.useRef(true);
  const inputRef = React.useRef<HTMLInputElement>(null!);
  const listboxRef = React.useRef<HTMLUListElement>(null!);
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);

  const [focusedTag, setFocusedTag] = React.useState(-1);
  const defaultHighlighted = autoHighlight ? 0 : -1;
  const highlightedIndexRef = React.useRef(defaultHighlighted);

  const [value, setValueState] = useControlled({
    controlled: valueProp,
    default: defaultValue,
    name: componentName,
  });
  const [inputValue, setInputValueState] = useControlled({
    controlled: inputValueProp,
    default: '',
    name: componentName,
    state: 'inputValue',
  });

  const [focused, setFocused] = React.useState(false);

  const resetInputValue = React.useCallback(
    (
      event: React.SyntheticEvent,
      newValue: AutocompleteValue<Value, Multiple, DisableClearable, FreeSolo>,
    ) => {
      // retain current `inputValue` if new option isn't selected and `clearOnBlur` is false
      // When `multiple` is enabled, `newValue` is an array of all selected items including the newly selected item
      const isOptionSelected = multiple
        ? (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length <
          (newValue as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length
        : newValue !== null;
      if (!isOptionSelected && !clearOnBlur) {
        return;
      }
      let newInputValue;
      if (multiple) {
        newInputValue = '';
      } else if (newValue == null) {
        newInputValue = '';
      } else {
        const optionLabel = getOptionLabel(
          newValue as NonNullable<AutocompleteValue<Value, false, DisableClearable, FreeSolo>>,
        );
        newInputValue = typeof optionLabel === 'string' ? optionLabel : '';
      }

      if (inputValue === newInputValue) {
        return;
      }

      setInputValueState(newInputValue);

      if (onInputChange) {
        onInputChange(event, newInputValue, 'reset');
      }
    },
    [getOptionLabel, inputValue, multiple, onInputChange, setInputValueState, clearOnBlur, value],
  );

  const [open, setOpenState] = useControlled({
    controlled: openProp,
    default: false,
    name: componentName,
    state: 'open',
  });

  const [inputPristine, setInputPristine] = React.useState(true);

  const inputValueIsSelectedValue =
    !multiple &&
    value != null &&
    inputValue ===
      getOptionLabel(
        value as NonNullable<AutocompleteValue<Value, false, DisableClearable, FreeSolo>>,
      );

  const popupOpen = open && !readOnly;

  const filteredOptions = popupOpen
    ? filterOptions(
        options.filter((option) => {
          if (
            filterSelectedOptions &&
            (multiple
              ? (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>)
              : [value]
            ).some((value2) => value2 !== null && isOptionEqualToValue(option, value2 as Value))
          ) {
            return false;
          }
          return true;
        }),
        // we use the empty string to manipulate `filterOptions` to not filter any options
        // i.e. the filter predicate always returns true
        {
          inputValue: inputValueIsSelectedValue && inputPristine ? '' : inputValue,
          getOptionLabel,
        },
      )
    : [];

  const previousProps = usePreviousProps({
    filteredOptions,
    value,
    inputValue,
  });

  React.useEffect(() => {
    const valueChange = value !== previousProps.value;

    if (focused && !valueChange) {
      return;
    }

    // Only reset the input's value when freeSolo if the component's value changes.
    if (freeSolo && !valueChange) {
      return;
    }

    resetInputValue(null!, value);
  }, [value, resetInputValue, focused, previousProps.value, freeSolo]);

  const listboxAvailable = open && filteredOptions.length > 0 && !readOnly;

  if (process.env.NODE_ENV !== 'production') {
    if (value !== null && !freeSolo && options.length > 0) {
      const missingValue = (
        multiple ? (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>) : [value]
      ).filter(
        (value2) => !options.some((option) => isOptionEqualToValue(option, value2 as Value)),
      );

      if (missingValue.length > 0) {
        console.warn(
          [
            `MUI: The value provided to ${componentName} is invalid.`,
            `None of the options match with \`${
              missingValue.length > 1
                ? JSON.stringify(missingValue)
                : JSON.stringify(missingValue[0])
            }\`.`,
            'You can use the `isOptionEqualToValue` prop to customize the equality test.',
          ].join('\n'),
        );
      }
    }
  }

  const focusTag = useEventCallback((tagToFocus) => {
    if (tagToFocus === -1) {
      inputRef.current.focus();
    } else {
      anchorEl?.querySelector<HTMLElement>(`[data-tag-index="${tagToFocus}"]`)?.focus();
    }
  });

  // Ensure the focusedTag is never inconsistent
  React.useEffect(() => {
    if (
      multiple &&
      focusedTag > (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length - 1
    ) {
      setFocusedTag(-1);
      focusTag(-1);
    }
  }, [value, multiple, focusedTag, focusTag]);

  function validOptionIndex(index: number, direction: AutocompleteChangeDirection) {
    if (!listboxRef.current || index < 0 || index >= filteredOptions.length) {
      return -1;
    }

    let nextFocus = index;

    while (true) {
      const option = listboxRef.current.querySelector<HTMLLIElement & { disabled?: boolean }>(
        `[data-option-index="${nextFocus}"]`,
      );

      // Same logic as MenuList.js
      const nextFocusDisabled = disabledItemsFocusable
        ? false
        : !option || option.disabled || option.getAttribute('aria-disabled') === 'true';

      if (option && option.hasAttribute('tabindex') && !nextFocusDisabled) {
        // The next option is available
        return nextFocus;
      }

      // The next option is disabled, move to the next element.
      // with looped index
      if (direction === 'next') {
        nextFocus = (nextFocus + 1) % filteredOptions.length;
      } else {
        nextFocus = (nextFocus - 1 + filteredOptions.length) % filteredOptions.length;
      }

      // We end up with initial index, that means we don't have available options.
      // All of them are disabled
      if (nextFocus === index) {
        return -1;
      }
    }
  }

  const setHighlightedIndex = useEventCallback(
    ({
      event,
      index = -1,
      reason = 'auto',
    }: {
      event?: React.SyntheticEvent;
      index?: number;
      reason?: AutocompleteHighlightChangeReason;
    }) => {
      highlightedIndexRef.current = index;

      // does the index exist?
      if (index === -1) {
        inputRef.current.removeAttribute('aria-activedescendant');
      } else {
        inputRef.current.setAttribute('aria-activedescendant', `${id}-option-${index}`);
      }

      if (onHighlightChange) {
        onHighlightChange(event!, index === -1 ? null : filteredOptions[index], reason);
      }

      if (!listboxRef.current) {
        return;
      }

      const prev = listboxRef.current.querySelector(
        `[role="option"].${unstable_classNamePrefix}-focused`,
      );
      if (prev) {
        prev.classList.remove(`${unstable_classNamePrefix}-focused`);
        prev.classList.remove(`${unstable_classNamePrefix}-focusVisible`);
      }

      let listboxNode = listboxRef.current;
      if (listboxRef.current.getAttribute('role') !== 'listbox') {
        listboxNode = listboxRef.current!.parentElement?.querySelector('[role="listbox"]')!;
      }

      // "No results"
      if (!listboxNode) {
        return;
      }

      if (index === -1) {
        listboxNode.scrollTop = 0;
        return;
      }

      const option = listboxRef.current.querySelector<HTMLElement>(
        `[data-option-index="${index}"]`,
      );

      if (!option) {
        return;
      }

      option.classList.add(`${unstable_classNamePrefix}-focused`);
      if (reason === 'keyboard') {
        option.classList.add(`${unstable_classNamePrefix}-focusVisible`);
      }

      // Scroll active descendant into view.
      // Logic copied from https://www.w3.org/WAI/content-assets/wai-aria-practices/patterns/combobox/examples/js/select-only.js
      // In case of mouse clicks and touch (in mobile devices) we avoid scrolling the element and keep both behaviors same.
      // Consider this API instead once it has a better browser support:
      // .scrollIntoView({ scrollMode: 'if-needed', block: 'nearest' });
      if (
        listboxNode.scrollHeight > listboxNode.clientHeight &&
        reason !== 'mouse' &&
        reason !== 'touch'
      ) {
        const element = option;

        const scrollBottom = listboxNode.clientHeight + listboxNode.scrollTop;
        const elementBottom = element.offsetTop + element.offsetHeight;
        if (elementBottom > scrollBottom) {
          listboxNode.scrollTop = elementBottom - listboxNode.clientHeight;
        } else if (
          element.offsetTop - element.offsetHeight * (groupBy ? 1.3 : 0) <
          listboxNode.scrollTop
        ) {
          listboxNode.scrollTop = element.offsetTop - element.offsetHeight * (groupBy ? 1.3 : 0);
        }
      }
    },
  );

  const changeHighlightedIndex = useEventCallback(
    ({
      event,
      diff,
      direction = 'next',
      reason = 'auto',
    }: {
      event?: React.SyntheticEvent;
      diff: 'reset' | 'start' | 'end' | number;
      direction?: AutocompleteChangeDirection;
      reason?: 'auto' | 'keyboard';
    }) => {
      if (!popupOpen) {
        return;
      }

      const getNextIndex = (): number => {
        const maxIndex = filteredOptions.length - 1;

        if (diff === 'reset') {
          return defaultHighlighted;
        }

        if (diff === 'start') {
          return 0;
        }

        if (diff === 'end') {
          return maxIndex;
        }

        const newIndex = highlightedIndexRef.current + diff;

        if (newIndex < 0) {
          if (newIndex === -1 && includeInputInList) {
            return -1;
          }

          if ((disableListWrap && highlightedIndexRef.current !== -1) || Math.abs(diff) > 1) {
            return 0;
          }

          return maxIndex;
        }

        if (newIndex > maxIndex) {
          if (newIndex === maxIndex + 1 && includeInputInList) {
            return -1;
          }

          if (disableListWrap || Math.abs(diff) > 1) {
            return maxIndex;
          }

          return 0;
        }

        return newIndex;
      };

      const nextIndex = validOptionIndex(getNextIndex(), direction);
      setHighlightedIndex({ index: nextIndex, reason, event });

      // Sync the content of the input with the highlighted option.
      if (autoComplete && diff !== 'reset') {
        if (nextIndex === -1) {
          inputRef.current.value = inputValue;
        } else {
          const option = getOptionLabel(filteredOptions[nextIndex]);
          inputRef.current.value = option;

          // The portion of the selected suggestion that has not been typed by the user,
          // a completion string, appears inline after the input cursor in the textbox.
          const index = option.toLowerCase().indexOf(inputValue.toLowerCase());
          if (index === 0 && inputValue.length > 0) {
            inputRef.current.setSelectionRange(inputValue.length, option.length);
          }
        }
      }
    },
  );

  const getPreviousHighlightedOptionIndex = () => {
    const isSameValue = (
      value1?: AutocompleteValue<Value, false, DisableClearable, FreeSolo>,
      value2?: AutocompleteValue<Value, false, DisableClearable, FreeSolo>,
    ) => {
      const label1 = value1 ? getOptionLabel(value1) : '';
      const label2 = value2 ? getOptionLabel(value2) : '';
      return label1 === label2;
    };

    if (
      highlightedIndexRef.current !== -1 &&
      previousProps.filteredOptions &&
      previousProps.filteredOptions.length !== filteredOptions.length &&
      previousProps.inputValue === inputValue &&
      (multiple
        ? (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length ===
            (previousProps.value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>)
              .length &&
          (previousProps.value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).every(
            (val, i) =>
              getOptionLabel(
                (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>)[i],
              ) === getOptionLabel(val),
          )
        : isSameValue(
            previousProps.value as AutocompleteValue<Value, false, DisableClearable, FreeSolo>,
            value as AutocompleteValue<Value, false, DisableClearable, FreeSolo>,
          ))
    ) {
      const previousHighlightedOption = previousProps.filteredOptions[highlightedIndexRef.current];

      if (previousHighlightedOption) {
        return filteredOptions.findIndex((option) => {
          return getOptionLabel(option) === getOptionLabel(previousHighlightedOption);
        });
      }
    }
    return -1;
  };

  const syncHighlightedIndex = React.useCallback(() => {
    if (!popupOpen) {
      return;
    }

    // Check if the previously highlighted option still exists in the updated filtered options list and if the value and inputValue haven't changed
    // If it exists and the value and the inputValue haven't changed, just update its index, otherwise continue execution
    const previousHighlightedOptionIndex = getPreviousHighlightedOptionIndex();
    if (previousHighlightedOptionIndex !== -1) {
      highlightedIndexRef.current = previousHighlightedOptionIndex;
      return;
    }

    const valueItem = (
      multiple ? (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>)[0] : value
    ) as AutocompleteValue<Value, false, DisableClearable, FreeSolo>;

    // The popup is empty, reset
    if (filteredOptions.length === 0 || valueItem == null) {
      changeHighlightedIndex({ diff: 'reset' });
      return;
    }

    if (!listboxRef.current) {
      return;
    }

    // Synchronize the value with the highlighted index
    if (valueItem != null) {
      const currentOption = filteredOptions[highlightedIndexRef.current];

      // Keep the current highlighted index if possible
      if (
        multiple &&
        currentOption &&
        (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).findIndex((val) =>
          isOptionEqualToValue(currentOption, val),
        ) !== -1
      ) {
        return;
      }

      const itemIndex = filteredOptions.findIndex((optionItem) =>
        isOptionEqualToValue(optionItem, valueItem),
      );
      if (itemIndex === -1) {
        changeHighlightedIndex({ diff: 'reset' });
      } else {
        setHighlightedIndex({ index: itemIndex });
      }
      return;
    }

    // Prevent the highlighted index to leak outside the boundaries.
    if (highlightedIndexRef.current >= filteredOptions.length - 1) {
      setHighlightedIndex({ index: filteredOptions.length - 1 });
      return;
    }

    // Restore the focus to the previous index.
    setHighlightedIndex({ index: highlightedIndexRef.current });
    // Ignore filteredOptions (and options, isOptionEqualToValue, getOptionLabel) not to break the scroll position
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Only sync the highlighted index when the option switch between empty and not
    filteredOptions.length,
    // Don't sync the highlighted index with the value when multiple
    // eslint-disable-next-line react-hooks/exhaustive-deps
    multiple ? false : value,
    filterSelectedOptions,
    changeHighlightedIndex,
    setHighlightedIndex,
    popupOpen,
    inputValue,
    multiple,
  ]);

  const handleListboxRef = useEventCallback((node) => {
    setRef(listboxRef, node);

    if (!node) {
      return;
    }

    syncHighlightedIndex();
  });

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      if (!inputRef.current || inputRef.current.nodeName !== 'INPUT') {
        if (inputRef.current && inputRef.current.nodeName === 'TEXTAREA') {
          console.warn(
            [
              `A textarea element was provided to ${componentName} where input was expected.`,
              `This is not a supported scenario but it may work under certain conditions.`,
              `A textarea keyboard navigation may conflict with Autocomplete controls (for example enter and arrow keys).`,
              `Make sure to test keyboard navigation and add custom event handlers if necessary.`,
            ].join('\n'),
          );
        } else {
          console.error(
            [
              `MUI: Unable to find the input element. It was resolved to ${inputRef.current} while an HTMLInputElement was expected.`,
              `Instead, ${componentName} expects an input element.`,
              '',
              componentName === 'useAutocomplete'
                ? 'Make sure you have bound getInputProps correctly and that the normal ref/effect resolutions order is guaranteed.'
                : 'Make sure you have customized the input component correctly.',
            ].join('\n'),
          );
        }
      }
    }, [componentName]);
  }

  React.useEffect(() => {
    syncHighlightedIndex();
  }, [syncHighlightedIndex]);

  const handleOpen = (event: React.SyntheticEvent) => {
    if (open) {
      return;
    }

    setOpenState(true);
    setInputPristine(true);

    if (onOpen) {
      onOpen(event);
    }
  };

  const handleClose = (event: React.SyntheticEvent, reason: AutocompleteCloseReason) => {
    if (!open) {
      return;
    }

    setOpenState(false);

    if (onClose) {
      onClose(event, reason);
    }
  };

  const handleValue = (
    event: React.SyntheticEvent,
    newValue: AutocompleteValue<Value, Multiple, DisableClearable, FreeSolo>,
    reason: AutocompleteChangeReason,
    details?: AutocompleteChangeDetails<Value, FreeSolo>,
  ) => {
    if (multiple) {
      if (
        (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length ===
          (newValue as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length &&
        (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).every(
          (val, i) =>
            val === (newValue as AutocompleteValue<Value, true, DisableClearable, FreeSolo>)[i],
        )
      ) {
        return;
      }
    } else if (value === newValue) {
      return;
    }

    if (onChange) {
      onChange(event, newValue, reason, details);
    }

    setValueState(newValue);
  };

  const isTouch = React.useRef(false);

  const selectNewValue = (
    event: React.SyntheticEvent,
    option: Value | AutocompleteFreeSoloValueMapping<FreeSolo>,
    reasonProp: AutocompleteChangeReason = 'selectOption',
    origin: 'options' | 'freeSolo' = 'options',
  ) => {
    let reason: AutocompleteChangeReason | AutocompleteCloseReason = reasonProp;
    let newValue: AutocompleteValue<Value, Multiple, DisableClearable, FreeSolo>;

    if (multiple) {
      newValue = (Array.isArray(value) ? value.slice() : []) as AutocompleteValue<
        Value,
        Multiple,
        DisableClearable,
        FreeSolo
      >;

      if (process.env.NODE_ENV !== 'production') {
        const matches = (
          newValue as AutocompleteValue<Value, true, DisableClearable, FreeSolo>
        ).filter((val) => isOptionEqualToValue(option, val));

        if (matches.length > 1) {
          console.error(
            [
              `MUI: The \`isOptionEqualToValue\` method of ${componentName} does not handle the arguments correctly.`,
              `The component expects a single value to match a given option but found ${matches.length} matches.`,
            ].join('\n'),
          );
        }
      }

      const itemIndex = (
        newValue as AutocompleteValue<Value, true, DisableClearable, FreeSolo>
      ).findIndex((valueItem) => isOptionEqualToValue(option, valueItem));

      if (itemIndex === -1) {
        (newValue as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).push(option);
      } else if (origin !== 'freeSolo') {
        (newValue as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).splice(
          itemIndex,
          1,
        );
        reason = 'removeOption';
      }
    } else {
      newValue = option as AutocompleteValue<Value, Multiple, DisableClearable, FreeSolo>;
    }

    resetInputValue(event, newValue);

    handleValue(event, newValue, reason, { option });
    if (
      !disableCloseOnSelect &&
      (!event ||
        (!(event as React.KeyboardEvent).ctrlKey && !(event as React.KeyboardEvent).metaKey))
    ) {
      handleClose(event, reason as AutocompleteCloseReason);
    }

    if (
      blurOnSelect === true ||
      (blurOnSelect === 'touch' && isTouch.current) ||
      (blurOnSelect === 'mouse' && !isTouch.current)
    ) {
      inputRef.current.blur();
    }
  };

  function validTagIndex(index: number, direction: AutocompleteChangeDirection) {
    if (index === -1) {
      return -1;
    }

    let nextFocus = index;

    while (true) {
      // Out of range
      if (
        (direction === 'next' &&
          nextFocus ===
            (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length) ||
        (direction === 'previous' && nextFocus === -1)
      ) {
        return -1;
      }

      const option = anchorEl?.querySelector<HTMLElement & { disabled?: boolean }>(
        `[data-tag-index="${nextFocus}"]`,
      );

      // Same logic as MenuList.js
      if (
        !option ||
        !option.hasAttribute('tabindex') ||
        option.disabled ||
        option.getAttribute('aria-disabled') === 'true'
      ) {
        nextFocus += direction === 'next' ? 1 : -1;
      } else {
        return nextFocus;
      }
    }
  }

  const handleFocusTag = (event: any, direction: AutocompleteChangeDirection) => {
    if (!multiple) {
      return;
    }

    if (inputValue === '') {
      handleClose(event, 'toggleInput');
    }

    let nextTag = focusedTag;

    if (focusedTag === -1) {
      if (inputValue === '' && direction === 'previous') {
        nextTag = (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length - 1;
      }
    } else {
      nextTag += direction === 'next' ? 1 : -1;

      if (nextTag < 0) {
        nextTag = 0;
      }

      if (
        nextTag === (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length
      ) {
        nextTag = -1;
      }
    }

    nextTag = validTagIndex(nextTag, direction);

    setFocusedTag(nextTag);
    focusTag(nextTag);
  };

  const handleClear = (event: React.SyntheticEvent) => {
    ignoreFocus.current = true;
    setInputValueState('');

    if (onInputChange) {
      onInputChange(event, '', 'clear');
    }

    handleValue(
      event,
      (multiple ? [] : null) as AutocompleteValue<Value, Multiple, DisableClearable, FreeSolo>,
      'clear',
    );
  };

  const handleKeyDown =
    (other: any) => (event: React.KeyboardEvent<HTMLInputElement> & MuiCancellableEvent) => {
      if (other.onKeyDown) {
        other.onKeyDown(event);
      }

      if (event.defaultMuiPrevented) {
        return;
      }

      if (focusedTag !== -1 && ['ArrowLeft', 'ArrowRight'].indexOf(event.key) === -1) {
        setFocusedTag(-1);
        focusTag(-1);
      }

      // Wait until IME is settled.
      if (event.which !== 229) {
        switch (event.key) {
          case 'Home':
            if (popupOpen && handleHomeEndKeys) {
              // Prevent scroll of the page
              event.preventDefault();
              changeHighlightedIndex({
                diff: 'start',
                direction: 'next',
                reason: 'keyboard',
                event,
              });
            }
            break;
          case 'End':
            if (popupOpen && handleHomeEndKeys) {
              // Prevent scroll of the page
              event.preventDefault();
              changeHighlightedIndex({
                diff: 'end',
                direction: 'previous',
                reason: 'keyboard',
                event,
              });
            }
            break;
          case 'PageUp':
            // Prevent scroll of the page
            event.preventDefault();
            changeHighlightedIndex({
              diff: -pageSize,
              direction: 'previous',
              reason: 'keyboard',
              event,
            });
            handleOpen(event);
            break;
          case 'PageDown':
            // Prevent scroll of the page
            event.preventDefault();
            changeHighlightedIndex({
              diff: pageSize,
              direction: 'next',
              reason: 'keyboard',
              event,
            });
            handleOpen(event);
            break;
          case 'ArrowDown':
            // Prevent cursor move
            event.preventDefault();
            changeHighlightedIndex({ diff: 1, direction: 'next', reason: 'keyboard', event });
            handleOpen(event);
            break;
          case 'ArrowUp':
            // Prevent cursor move
            event.preventDefault();
            changeHighlightedIndex({ diff: -1, direction: 'previous', reason: 'keyboard', event });
            handleOpen(event);
            break;
          case 'ArrowLeft':
            handleFocusTag(event, 'previous');
            break;
          case 'ArrowRight':
            handleFocusTag(event, 'next');
            break;
          case 'Enter':
            if (highlightedIndexRef.current !== -1 && popupOpen) {
              const option = filteredOptions[highlightedIndexRef.current];
              const disabled = getOptionDisabled ? getOptionDisabled(option) : false;

              // Avoid early form validation, let the end-users continue filling the form.
              event.preventDefault();

              if (disabled) {
                return;
              }

              selectNewValue(event, option, 'selectOption');

              // Move the selection to the end.
              if (autoComplete) {
                inputRef.current.setSelectionRange(
                  inputRef.current.value.length,
                  inputRef.current.value.length,
                );
              }
            } else if (freeSolo && inputValue !== '' && inputValueIsSelectedValue === false) {
              if (multiple) {
                // Allow people to add new values before they submit the form.
                event.preventDefault();
              }
              selectNewValue(
                event,
                inputValue as AutocompleteFreeSoloValueMapping<FreeSolo>,
                'createOption',
                'freeSolo',
              );
            }
            break;
          case 'Escape':
            if (popupOpen) {
              // Avoid Opera to exit fullscreen mode.
              event.preventDefault();
              // Avoid the Modal to handle the event.
              event.stopPropagation();
              handleClose(event, 'escape');
            } else if (
              clearOnEscape &&
              (inputValue !== '' ||
                (multiple &&
                  (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length > 0))
            ) {
              // Avoid Opera to exit fullscreen mode.
              event.preventDefault();
              // Avoid the Modal to handle the event.
              event.stopPropagation();
              handleClear(event);
            }
            break;
          case 'Backspace':
            // Remove the value on the left of the "cursor"
            if (
              multiple &&
              !readOnly &&
              inputValue === '' &&
              (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length > 0
            ) {
              const index =
                focusedTag === -1
                  ? (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length - 1
                  : focusedTag;
              const newValue = (
                value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>
              ).slice();
              newValue.splice(index, 1);
              handleValue(
                event,
                newValue as AutocompleteValue<Value, Multiple, DisableClearable, FreeSolo>,
                'removeOption',
                {
                  option: (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>)[
                    index
                  ],
                },
              );
            }
            break;
          case 'Delete':
            // Remove the value on the right of the "cursor"
            if (
              multiple &&
              !readOnly &&
              inputValue === '' &&
              (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length > 0 &&
              focusedTag !== -1
            ) {
              const index = focusedTag;
              const newValue = (
                value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>
              ).slice();
              newValue.splice(index, 1);
              handleValue(
                event,
                newValue as AutocompleteValue<Value, Multiple, DisableClearable, FreeSolo>,
                'removeOption',
                {
                  option: (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>)[
                    index
                  ],
                },
              );
            }
            break;
          default:
        }
      }
    };

  const handleFocus = (event: React.SyntheticEvent) => {
    setFocused(true);

    if (openOnFocus && !ignoreFocus.current) {
      handleOpen(event);
    }
  };

  const handleBlur = (event?: React.FocusEvent) => {
    // Ignore the event when using the scrollbar with IE11
    if (unstable_isActiveElementInListbox(listboxRef)) {
      inputRef.current.focus();
      return;
    }

    setFocused(false);
    firstFocus.current = true;
    ignoreFocus.current = false;

    if (autoSelect && highlightedIndexRef.current !== -1 && popupOpen) {
      selectNewValue(event!, filteredOptions[highlightedIndexRef.current], 'blur');
    } else if (autoSelect && freeSolo && inputValue !== '') {
      selectNewValue(
        event!,
        inputValue as AutocompleteFreeSoloValueMapping<FreeSolo>,
        'blur',
        'freeSolo',
      );
    } else if (clearOnBlur) {
      resetInputValue(event!, value);
    }

    handleClose(event!, 'blur');
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;

    if (inputValue !== newValue) {
      setInputValueState(newValue);
      setInputPristine(false);

      if (onInputChange) {
        onInputChange(event, newValue, 'input');
      }
    }

    if (newValue === '') {
      if (!disableClearable && !multiple) {
        handleValue(
          event,
          null as AutocompleteValue<Value, Multiple, DisableClearable, FreeSolo>,
          'clear',
        );
      }
    } else {
      handleOpen(event);
    }
  };

  const handleOptionMouseMove = (event: React.MouseEvent) => {
    const index = Number(event.currentTarget.getAttribute('data-option-index'));
    if (highlightedIndexRef.current !== index) {
      setHighlightedIndex({
        event,
        index,
        reason: 'mouse',
      });
    }
  };

  const handleOptionTouchStart = (event: React.TouchEvent) => {
    setHighlightedIndex({
      event,
      index: Number(event.currentTarget.getAttribute('data-option-index')),
      reason: 'touch',
    });
    isTouch.current = true;
  };

  const handleOptionClick = (event: React.MouseEvent) => {
    const index = Number(event.currentTarget.getAttribute('data-option-index'));
    selectNewValue(event, filteredOptions[index], 'selectOption');

    isTouch.current = false;
  };

  const handleTagDelete = (index: number) => (event: React.SyntheticEvent) => {
    const newValue = (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).slice();
    newValue.splice(index, 1);
    handleValue(
      event,
      newValue as AutocompleteValue<Value, Multiple, DisableClearable, FreeSolo>,
      'removeOption',
      {
        option: (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>)[index],
      },
    );
  };

  const handlePopupIndicator = (event: React.SyntheticEvent) => {
    if (open) {
      handleClose(event, 'toggleInput');
    } else {
      handleOpen(event);
    }
  };

  // Prevent input blur when interacting with the combobox
  const handleMouseDown = (event: any) => {
    // Prevent focusing the input if click is anywhere outside the Autocomplete
    if (!event.currentTarget.contains(event.target)) {
      return;
    }
    if (event.target.getAttribute('id') !== id) {
      event.preventDefault();
    }
  };

  // Focus the input when interacting with the combobox
  const handleClick = (event: any) => {
    // Prevent focusing the input if click is anywhere outside the Autocomplete
    if (!event.currentTarget.contains(event.target)) {
      return;
    }
    inputRef.current.focus();

    if (
      selectOnFocus &&
      firstFocus.current &&
      inputRef.current.selectionEnd! - inputRef.current.selectionStart! === 0
    ) {
      inputRef.current.select();
    }

    firstFocus.current = false;
  };

  const handleInputMouseDown = (event: React.MouseEvent) => {
    if (!disabledProp && (inputValue === '' || !open)) {
      handlePopupIndicator(event);
    }
  };

  let dirty = freeSolo && inputValue.length > 0;
  dirty =
    dirty ||
    (multiple
      ? (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>).length > 0
      : value !== null);

  let groupedOptions: Value[] | AutocompleteGroupedOption<Value>[] = filteredOptions;
  if (groupBy) {
    // used to keep track of key and indexes in the result array
    const indexBy = new Map<string, boolean>();
    let warn = false;

    groupedOptions = filteredOptions.reduce((acc, option, index) => {
      const group = groupBy(option);

      if (acc.length > 0 && acc[acc.length - 1].group === group) {
        acc[acc.length - 1].options.push(option);
      } else {
        if (process.env.NODE_ENV !== 'production') {
          if (indexBy.get(group) && !warn) {
            console.warn(
              `MUI: The options provided combined with the \`groupBy\` method of ${componentName} returns duplicated headers.`,
              'You can solve the issue by sorting the options with the output of `groupBy`.',
            );
            warn = true;
          }
          indexBy.set(group, true);
        }

        acc.push({
          key: index,
          index,
          group,
          options: [option],
        });
      }

      return acc;
    }, [] as AutocompleteGroupedOption<Value>[]);
  }

  if (disabledProp && focused) {
    handleBlur();
  }

  return {
    getRootProps: (other = {}) => ({
      'aria-owns': listboxAvailable ? `${id}-listbox` : null,
      ...other,
      onKeyDown: handleKeyDown(other),
      onMouseDown: handleMouseDown,
      onClick: handleClick,
    }),
    getInputLabelProps: () => ({
      id: `${id}-label`,
      htmlFor: id,
    }),
    getInputProps: () => ({
      id,
      value: inputValue,
      onBlur: handleBlur,
      onFocus: handleFocus,
      onChange: handleInputChange,
      onMouseDown: handleInputMouseDown,
      // if open then this is handled imperatively so don't let react override
      // only have an opinion about this when closed
      'aria-activedescendant': popupOpen ? '' : undefined,
      'aria-autocomplete': autoComplete ? 'both' : 'list',
      'aria-controls': listboxAvailable ? `${id}-listbox` : undefined,
      'aria-expanded': listboxAvailable,
      // Disable browser's suggestion that might overlap with the popup.
      // Handle autocomplete but not autofill.
      autoComplete: 'off',
      ref: inputRef,
      autoCapitalize: 'none',
      spellCheck: 'false',
      role: 'combobox',
      disabled: disabledProp,
    }),
    getClearProps: () => ({
      tabIndex: -1,
      type: 'button',
      onClick: handleClear,
    }),
    getPopupIndicatorProps: () => ({
      tabIndex: -1,
      type: 'button',
      onClick: handlePopupIndicator,
    }),
    getTagProps: (({ index }) => ({
      key: index,
      'data-tag-index': index,
      tabIndex: -1,
      ...(!readOnly && { onDelete: handleTagDelete(index) }),
    })) as AutocompleteGetTagProps,
    getListboxProps: () => ({
      role: 'listbox',
      id: `${id}-listbox`,
      'aria-labelledby': `${id}-label`,
      ref: handleListboxRef,
      onMouseDown: (event) => {
        // Prevent blur
        event.preventDefault();
      },
    }),
    getOptionProps: ({ index, option }) => {
      const selected = (
        multiple ? (value as AutocompleteValue<Value, true, DisableClearable, FreeSolo>) : [value]
      ).some((value2) => value2 != null && isOptionEqualToValue(option, value2 as Value));
      const disabled = getOptionDisabled ? getOptionDisabled(option) : false;

      return {
        key: getOptionKey?.(option) ?? getOptionLabel(option),
        tabIndex: -1,
        role: 'option',
        id: `${id}-option-${index}`,
        onMouseMove: handleOptionMouseMove,
        onClick: handleOptionClick,
        onTouchStart: handleOptionTouchStart,
        'data-option-index': index,
        'aria-disabled': disabled,
        'aria-selected': selected,
      };
    },
    id,
    inputValue,
    value,
    dirty,
    expanded: Boolean(popupOpen && anchorEl),
    popupOpen,
    focused: focused || focusedTag !== -1,
    anchorEl,
    setAnchorEl,
    focusedTag,
    groupedOptions,
  };
}
