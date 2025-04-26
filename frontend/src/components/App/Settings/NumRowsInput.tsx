import { Icon } from '@iconify/react';
import {
  Box,
  Button,
  FormControl,
  IconButton,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { getTablesRowsPerPage, setTablesRowsPerPage } from '../../../helpers/tablesRowsPerPage';
import { defaultTableRowsPerPageOptions, setAppSettings } from '../../../redux/configSlice';

export default function NumRowsInput(props: { defaultValue: number[] }) {
  const { t } = useTranslation(['frequent']);
  const { defaultValue } = props;
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [options, setOptions] = useState(defaultValue);
  const focusedRef = useCallback((node: HTMLElement) => {
    if (node !== null) {
      node.focus();
    }
  }, []);
  const defaultRowsPerPageValue = useMemo(() => {
    const val = getTablesRowsPerPage();
    if (options.includes(val)) {
      return val;
    }
    return defaultTableRowsPerPageOptions[0];
  }, []);
  const [selectedValue, setSelectedValue] = useState(defaultRowsPerPageValue);
  const storedCustomValue = useMemo(() => {
    const val = options.find(val => !defaultTableRowsPerPageOptions.includes(val));
    if (!val) {
      return defaultTableRowsPerPageOptions[0];
    }
    return val;
  }, []);
  const [customValue, setCustomValue] = useState<number | undefined>(storedCustomValue);
  const [errorMessage, setErrorMessage] = useState('');
  const [minRows, maxRows] = [5, 1000];
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setAppSettings({ tableRowsPerPageOptions: options }));
  }, [options]);

  // Make sure we update the value in the localStorage when the user selects a new value.
  useEffect(() => {
    if (selectedValue !== -1) {
      setTablesRowsPerPage(selectedValue);
    }
  }, [selectedValue]);

  const handleChange = (event: SelectChangeEvent<number>) => {
    const val = parseInt(event.target.value as string);
    setSelectedValue(val);
  };

  const handleClose = () => {
    setIsSelectOpen(false);
  };

  const handleOpen = () => {
    setIsSelectOpen(true);
  };

  const suggestionMsg = t('translation|Enter a value between {{ minRows }} and {{ maxRows }}.', {
    minRows,
    maxRows,
  });

  return (
    // we have assigned value -1 to select custom option
    selectedValue === -1 ? (
      <Box display="inline-flex" alignItems="baseline">
        <TextField
          type={'number'}
          value={customValue}
          error={!!errorMessage}
          placeholder={t('translation|Custom row value')}
          helperText={errorMessage || suggestionMsg}
          inputProps={{ min: minRows, max: maxRows }}
          inputRef={focusedRef}
          onChange={e => {
            const val = parseInt(e.target.value);
            if (Number.isInteger(val)) {
              if (val < 5 || val > maxRows) {
                setErrorMessage(suggestionMsg);
              } else {
                setErrorMessage('');
              }
              setCustomValue(val);
            } else {
              setCustomValue(undefined);
            }
          }}
        />
        <Box display="inline-flex" alignItems="center" mx={1}>
          <Button
            variant="contained"
            disabled={!!errorMessage}
            size="small"
            onClick={() => {
              if (customValue === undefined) {
                return;
              }
              const newOptions = [...new Set([...defaultTableRowsPerPageOptions, customValue])];
              newOptions.sort((a, b) => a - b);
              setOptions(newOptions);
              setSelectedValue(customValue);
            }}
          >
            {t('translation|Apply')}
          </Button>
          <IconButton
            aria-label={t('translation|Delete')}
            onClick={() => {
              setOptions(defaultTableRowsPerPageOptions);
              setSelectedValue(defaultTableRowsPerPageOptions[0]);
            }}
            size="medium"
          >
            <Icon icon="mdi:delete" />
          </IconButton>
        </Box>
      </Box>
    ) : (
      <FormControl>
        <Select
          value={selectedValue}
          style={{ width: '100px' }}
          open={isSelectOpen}
          onClose={handleClose}
          onOpen={handleOpen}
          onChange={handleChange}
          renderValue={value => `${value}`}
          size="small"
          variant="outlined"
        >
          {options.map(option => {
            const isCustom = !defaultTableRowsPerPageOptions.includes(option);
            return (
              <MenuItem key={option} value={option}>
                <ListItemText primary={option} />
                {isCustom && (
                  <ListItemSecondaryAction>
                    <IconButton
                      size="small"
                      aria-label={t('translation|Delete')}
                      onClick={() => {
                        setOptions(defaultTableRowsPerPageOptions);
                        setSelectedValue(defaultTableRowsPerPageOptions[0]);
                        setIsSelectOpen(false);
                      }}
                    >
                      <Icon icon="mdi:delete" />
                    </IconButton>
                  </ListItemSecondaryAction>
                )}
              </MenuItem>
            );
          })}
          <MenuItem key={'custom'} value={-1}>
            {t('translation|Custom value')}
          </MenuItem>
        </Select>
      </FormControl>
    )
  );
}
