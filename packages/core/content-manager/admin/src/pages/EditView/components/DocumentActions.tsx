import * as React from 'react';

import {
  useForm,
  useNotification,
  NotificationConfig,
  useAPIErrorHandler,
  useQueryParams,
  tours,
} from '@strapi/admin/strapi-admin';
import {
  Button,
  Dialog,
  Flex,
  Modal,
  Radio,
  Typography,
  VisuallyHidden,
  Menu,
  ButtonProps,
} from '@strapi/design-system';
import { Cross, More, WarningCircle } from '@strapi/icons';
import mapValues from 'lodash/fp/mapValues';
import get from 'lodash/get';
import merge from 'lodash/merge';
import set from 'lodash/set';
import { useIntl } from 'react-intl';
import { useMatch, useNavigate, useParams } from 'react-router-dom';

import { Create, Publish } from '../../../../../shared/contracts/collection-types';
import { PUBLISHED_AT_ATTRIBUTE_NAME } from '../../../constants/attributes';
import { SINGLE_TYPES } from '../../../constants/collections';
import { useDocumentRBAC } from '../../../features/DocumentRBAC';
import { useDoc, useDocument } from '../../../hooks/useDocument';
import { useDocumentActions } from '../../../hooks/useDocumentActions';
import { useDocumentContext } from '../../../hooks/useDocumentContext';
import { usePreviewContext } from '../../../preview/pages/Preview';
import { CLONE_PATH, LIST_PATH } from '../../../router';
import {
  useGetDraftRelationCountQuery,
  useUpdateDocumentMutation,
} from '../../../services/documents';
import { isBaseQueryError, buildValidParams } from '../../../utils/api';
import { getTranslation } from '../../../utils/translations';
import { AnyData, handleInvisibleAttributes } from '../utils/data';

import { useRelationModal } from './FormInputs/Relations/RelationModal';

import type { RelationsFormValue } from './FormInputs/Relations/Relations';
import type { DocumentActionComponent } from '../../../content-manager';
/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/
type DocumentActionPosition = 'panel' | 'header' | 'table-row' | 'preview' | 'relation-modal';

interface DocumentActionDescription {
  label: string;
  onClick?: (event: React.SyntheticEvent) => Promise<boolean | void> | boolean | void;
  icon?: React.ReactNode;
  /**
   * @default false
   */
  disabled?: boolean;
  /**
   * @default 'panel'
   * @description Where the action should be rendered.
   */
  position?: DocumentActionPosition | DocumentActionPosition[];
  dialog?: DialogOptions | NotificationOptions | ModalOptions;
  /**
   * @default 'secondary'
   */
  variant?: ButtonProps['variant'];
  loading?: ButtonProps['loading'];
}

interface DialogOptions {
  type: 'dialog';
  title: string;
  content?: React.ReactNode;
  variant?: ButtonProps['variant'];
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
}

interface NotificationOptions {
  type: 'notification';
  title: string;
  link?: {
    label: string;
    url: string;
    target?: string;
  };
  content?: string;
  onClose?: () => void;
  status?: NotificationConfig['type'];
  timeout?: number;
}

interface ModalOptions {
  type: 'modal';
  title: string;
  content: React.ComponentType<{ onClose: () => void }> | React.ReactNode;
  footer?: React.ComponentType<{ onClose: () => void }> | React.ReactNode;
  onClose?: () => void;
}

/* -------------------------------------------------------------------------------------------------
 * DocumentActions
 * -----------------------------------------------------------------------------------------------*/

interface Action extends DocumentActionDescription {
  id: string;
}

interface DocumentActionsProps {
  actions: Action[];
}

const connectRelationToParent = (
  parentDataToUpdate: AnyData | undefined,
  fieldToConnect: string,
  data: Create.Response['data'] | Publish.Response['data'],
  fieldToConnectUID?: string
) => {
  /*
   * Check if the fieldToConnect is already present in the parentDataToUpdate.
   * This happens in particular when in the parentDocument you have created
   * a new component without saving.
   */
  const isFieldPresent = !!get(parentDataToUpdate, fieldToConnect);
  const fieldToConnectPath = isFieldPresent
    ? fieldToConnect
    : // Compute the path to the parent object
      fieldToConnect.split('.').slice(0, -1).join('.');
  const fieldToConnectValue = isFieldPresent
    ? {
        connect: [
          {
            id: data.documentId,
            documentId: data.documentId,
            locale: data.locale,
          },
        ],
      }
    : {
        [fieldToConnect.split('.').pop()!]: {
          connect: [
            {
              id: data.documentId,
              documentId: data.documentId,
              locale: data.locale,
            },
          ],
          disconnect: [],
        },
        // In case the object was not present you need to pass the componentUID of the parent document
        __component: fieldToConnectUID,
      };
  const objectToConnect = set({}, fieldToConnectPath, fieldToConnectValue);
  return merge(parentDataToUpdate, objectToConnect);
};

const DocumentActions = ({ actions }: DocumentActionsProps) => {
  const { formatMessage } = useIntl();
  const [primaryAction, secondaryAction, ...restActions] = actions.filter((action) => {
    if (action.position === undefined) {
      return true;
    }

    const positions = Array.isArray(action.position) ? action.position : [action.position];
    return positions.includes('panel');
  });

  if (!primaryAction) {
    return null;
  }

  return (
    <Flex direction="column" gap={2} alignItems="stretch" width="100%">
      <tours.contentManager.Publish>
        <Flex gap={2}>
          {primaryAction.label === 'Publish' ? (
            <DocumentActionButton {...primaryAction} variant={primaryAction.variant || 'default'} />
          ) : (
            <DocumentActionButton {...primaryAction} variant={primaryAction.variant || 'default'} />
          )}

          {restActions.length > 0 ? (
            <DocumentActionsMenu
              actions={restActions}
              label={formatMessage({
                id: 'content-manager.containers.edit.panels.default.more-actions',
                defaultMessage: 'More document actions',
              })}
            />
          ) : null}
        </Flex>
      </tours.contentManager.Publish>
      {secondaryAction ? (
        secondaryAction.label === 'Publish' ? (
          <tours.contentManager.Publish>
            <DocumentActionButton
              {...secondaryAction}
              variant={secondaryAction.variant || 'secondary'}
            />
          </tours.contentManager.Publish>
        ) : (
          <DocumentActionButton
            {...secondaryAction}
            variant={secondaryAction.variant || 'secondary'}
          />
        )
      ) : null}
    </Flex>
  );
};

/* -------------------------------------------------------------------------------------------------
 * DocumentActionButton
 * -----------------------------------------------------------------------------------------------*/

interface DocumentActionButtonProps extends Action {}

const DocumentActionButton = (action: DocumentActionButtonProps) => {
  const [dialogId, setDialogId] = React.useState<string | null>(null);
  const { toggleNotification } = useNotification();

  const handleClick = (action: Action) => async (e: React.MouseEvent) => {
    const { onClick = () => false, dialog, id } = action;

    const muteDialog = await onClick(e);

    if (dialog && !muteDialog) {
      switch (dialog.type) {
        case 'notification':
          toggleNotification({
            title: dialog.title,
            message: dialog.content,
            type: dialog.status,
            timeout: dialog.timeout,
            onClose: dialog.onClose,
          });
          break;
        case 'dialog':
        case 'modal':
          e.preventDefault();
          setDialogId(id);
      }
    }
  };

  const handleClose = () => {
    setDialogId(null);
  };

  return (
    <>
      <Button
        flex="auto"
        startIcon={action.icon}
        disabled={action.disabled}
        onClick={handleClick(action)}
        justifyContent="center"
        variant={action.variant || 'default'}
        paddingTop="7px"
        paddingBottom="7px"
        loading={action.loading}
      >
        {action.label}
      </Button>
      {action.dialog?.type === 'dialog' ? (
        <DocumentActionConfirmDialog
          {...action.dialog}
          variant={action.dialog?.variant ?? action.variant}
          isOpen={dialogId === action.id}
          onClose={handleClose}
        />
      ) : null}
      {action.dialog?.type === 'modal' ? (
        <DocumentActionModal
          {...action.dialog}
          onModalClose={handleClose}
          isOpen={dialogId === action.id}
        />
      ) : null}
    </>
  );
};

/* -------------------------------------------------------------------------------------------------
 * DocumentActionMenu
 * -----------------------------------------------------------------------------------------------*/
interface DocumentActionsMenuProps {
  actions: Action[];
  children?: React.ReactNode;
  label?: string;
  variant?: 'ghost' | 'tertiary';
}

const DocumentActionsMenu = ({
  actions,
  children,
  label,
  variant = 'tertiary',
}: DocumentActionsMenuProps) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [dialogId, setDialogId] = React.useState<string | null>(null);
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const isDisabled = actions.every((action) => action.disabled) || actions.length === 0;

  const handleClick = (action: Action) => async (e: React.SyntheticEvent) => {
    const { onClick = () => false, dialog, id } = action;

    const muteDialog = await onClick(e);

    if (dialog && !muteDialog) {
      switch (dialog.type) {
        case 'notification':
          toggleNotification({
            title: dialog.title,
            message: dialog.content,
            type: dialog.status,
            timeout: dialog.timeout,
            onClose: dialog.onClose,
          });
          break;
        case 'dialog':
        case 'modal':
          setDialogId(id);
      }
    }
  };

  const handleClose = () => {
    setDialogId(null);
    setIsOpen(false);
  };

  return (
    <Menu.Root open={isOpen} onOpenChange={setIsOpen}>
      <Menu.Trigger
        disabled={isDisabled}
        size="S"
        endIcon={null}
        paddingTop="4px"
        paddingLeft="7px"
        paddingRight="7px"
        variant={variant}
      >
        <More aria-hidden focusable={false} />
        <VisuallyHidden tag="span">
          {label ||
            formatMessage({
              id: 'content-manager.containers.edit.panels.default.more-actions',
              defaultMessage: 'More document actions',
            })}
        </VisuallyHidden>
      </Menu.Trigger>
      <Menu.Content maxHeight={undefined} popoverPlacement="bottom-end">
        {actions.map((action) => {
          return (
            <Menu.Item
              disabled={action.disabled}
              /* @ts-expect-error – TODO: this is an error in the DS where it is most likely a synthetic event, not regular. */
              onSelect={handleClick(action)}
              display="block"
              key={action.id}
              variant={action.variant === 'danger' ? action.variant : 'default'}
              startIcon={action.icon}
            >
              <Flex justifyContent="space-between" gap={4}>
                <Flex gap={2} tag="span">
                  {action.label}
                </Flex>
              </Flex>
            </Menu.Item>
          );
        })}
        {children}
      </Menu.Content>
      {actions.map((action) => {
        return (
          <React.Fragment key={action.id}>
            {action.dialog?.type === 'dialog' ? (
              <DocumentActionConfirmDialog
                {...action.dialog}
                variant={action.variant}
                isOpen={dialogId === action.id}
                onClose={handleClose}
              />
            ) : null}
            {action.dialog?.type === 'modal' ? (
              <DocumentActionModal
                {...action.dialog}
                onModalClose={handleClose}
                isOpen={dialogId === action.id}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </Menu.Root>
  );
};

/* -------------------------------------------------------------------------------------------------
 * DocumentActionConfirmDialog
 * -----------------------------------------------------------------------------------------------*/

interface DocumentActionConfirmDialogProps extends DialogOptions, Pick<Action, 'variant'> {
  onClose: () => void;
  isOpen: Dialog.Props['open'];
  loading?: ButtonProps['loading'];
}

const DocumentActionConfirmDialog = ({
  onClose,
  onCancel,
  onConfirm,
  title,
  content,
  isOpen,
  variant = 'secondary',
  loading,
}: DocumentActionConfirmDialogProps) => {
  const { formatMessage } = useIntl();

  const handleClose = async () => {
    if (onCancel) {
      await onCancel();
    }

    onClose();
  };

  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm();
    }

    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleClose}>
      <Dialog.Content>
        <Dialog.Header>{title}</Dialog.Header>
        <Dialog.Body>{content}</Dialog.Body>
        <Dialog.Footer>
          <Dialog.Cancel>
            <Button variant="tertiary" fullWidth>
              {formatMessage({
                id: 'app.components.Button.cancel',
                defaultMessage: 'Cancel',
              })}
            </Button>
          </Dialog.Cancel>
          <Button onClick={handleConfirm} variant={variant} fullWidth loading={loading}>
            {formatMessage({
              id: 'app.components.Button.confirm',
              defaultMessage: 'Confirm',
            })}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
};

/* -------------------------------------------------------------------------------------------------
 * DocumentActionModal
 * -----------------------------------------------------------------------------------------------*/

interface DocumentActionModalProps extends ModalOptions {
  onModalClose: () => void;
  isOpen?: boolean;
}

const DocumentActionModal = ({
  isOpen,
  title,
  onClose,
  footer: Footer,
  content: Content,
  onModalClose,
}: DocumentActionModalProps) => {
  const handleClose = () => {
    if (onClose) {
      onClose();
    }

    onModalClose();
  };

  return (
    <Modal.Root open={isOpen} onOpenChange={handleClose}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        {typeof Content === 'function' ? (
          <Content onClose={handleClose} />
        ) : (
          <Modal.Body>{Content}</Modal.Body>
        )}
        {typeof Footer === 'function' ? <Footer onClose={handleClose} /> : Footer}
      </Modal.Content>
    </Modal.Root>
  );
};

const transformData = (data: Record<string, any>): any => {
  if (Array.isArray(data)) {
    return data.map(transformData);
  }

  if (typeof data === 'object' && data !== null) {
    if ('apiData' in data) {
      return data.apiData;
    }

    return mapValues(transformData)(data);
  }

  return data;
};

/* -------------------------------------------------------------------------------------------------
 * DocumentActionComponents
 * -----------------------------------------------------------------------------------------------*/

const PublishAction: DocumentActionComponent = ({
  activeTab,
  documentId,
  model,
  collectionType,
  meta,
  document,
}) => {
  const {
    currentDocument: { schema },
  } = useDocumentContext('PublishAction');

  const navigate = useNavigate();
  const { toggleNotification } = useNotification();
  const { _unstableFormatValidationErrors: formatValidationErrors } = useAPIErrorHandler();
  const isListView = useMatch(LIST_PATH) !== null;
  const isCloning = useMatch(CLONE_PATH) !== null;
  const { id } = useParams();
  const { formatMessage } = useIntl();
  const { canPublish, canReadFields } = useDocumentRBAC(
    'PublishAction',
    ({ canPublish, canReadFields }) => ({ canPublish, canReadFields })
  );
  const { publish, isLoading } = useDocumentActions();
  const onPreview = usePreviewContext('UpdateAction', (state) => state.onPreview, false);
  const [
    countDraftRelations,
    { isLoading: isLoadingDraftRelations, isError: isErrorDraftRelations },
  ] = useGetDraftRelationCountQuery();
  const [localCountOfDraftRelations, setLocalCountOfDraftRelations] = React.useState(0);
  const [serverCountOfDraftRelations, setServerCountOfDraftRelations] = React.useState(0);

  const [{ rawQuery }] = useQueryParams();

  const modified = useForm('PublishAction', ({ modified }) => modified);
  const setSubmitting = useForm('PublishAction', ({ setSubmitting }) => setSubmitting);
  const isSubmitting = useForm('PublishAction', ({ isSubmitting }) => isSubmitting);
  const validate = useForm('PublishAction', (state) => state.validate);
  const setErrors = useForm('PublishAction', (state) => state.setErrors);
  const formValues = useForm('PublishAction', ({ values }) => values);
  const resetForm = useForm('PublishAction', ({ resetForm }) => resetForm);
  const {
    currentDocument: { components },
  } = useDocumentContext('PublishAction');

  // need to discriminate if the publish is coming from a relation modal or in the edit view
  const relationContext = useRelationModal('PublishAction', () => true, false);
  const fromRelationModal = relationContext != undefined;

  const dispatch = useRelationModal('PublishAction', (state) => state.dispatch);
  const fieldToConnect = useRelationModal(
    'PublishAction',
    (state) => state.state.fieldToConnect,
    false
  );
  const fieldToConnectUID = useRelationModal(
    'PublishAction',
    (state) => state.state.fieldToConnectUID,
    false
  );
  const documentHistory = useRelationModal(
    'PublishAction',
    (state) => state.state.documentHistory,
    false
  );
  const rootDocumentMeta = useRelationModal('PublishAction', (state) => state.rootDocumentMeta);

  const { currentDocumentMeta } = useDocumentContext('PublishAction');
  const [updateDocumentMutation] = useUpdateDocumentMutation();
  const { _unstableFormatAPIError: formatAPIError } = useAPIErrorHandler();

  const idToPublish = currentDocumentMeta.documentId || id;

  React.useEffect(() => {
    if (isErrorDraftRelations) {
      toggleNotification({
        type: 'danger',
        message: formatMessage({
          id: getTranslation('error.records.fetch-draft-relatons'),
          defaultMessage: 'An error occurred while fetching draft relations on this document.',
        }),
      });
    }
  }, [isErrorDraftRelations, toggleNotification, formatMessage]);

  React.useEffect(() => {
    const localDraftRelations = new Set();

    /**
     * Extracts draft relations from the provided data object.
     * It checks for a connect array of relations.
     * If a relation has a status of 'draft', its id is added to the localDraftRelations set.
     */
    const extractDraftRelations = (data: Omit<RelationsFormValue, 'disconnect'>) => {
      const relations = data.connect || [];
      relations.forEach((relation) => {
        if (relation.status === 'draft') {
          localDraftRelations.add(relation.id);
        }
      });
    };

    /**
     * Recursively traverses the provided data object to extract draft relations from arrays within 'connect' keys.
     * If the data is an object, it looks for 'connect' keys to pass their array values to extractDraftRelations.
     * It recursively calls itself for any non-null objects it contains.
     */
    const traverseAndExtract = (data: { [field: string]: any }) => {
      Object.entries(data).forEach(([key, value]) => {
        if (key === 'connect' && Array.isArray(value)) {
          extractDraftRelations({ connect: value });
        } else if (typeof value === 'object' && value !== null) {
          traverseAndExtract(value);
        }
      });
    };

    if (!documentId || modified) {
      traverseAndExtract(formValues);
      setLocalCountOfDraftRelations(localDraftRelations.size);
    }
  }, [documentId, modified, formValues, setLocalCountOfDraftRelations]);

  React.useEffect(() => {
    if (!document || !document.documentId || isListView) {
      return;
    }

    const fetchDraftRelationsCount = async () => {
      const { data, error } = await countDraftRelations({
        collectionType,
        model,
        documentId,
        params: currentDocumentMeta.params,
      });

      if (error) {
        throw error;
      }

      if (data) {
        setServerCountOfDraftRelations(data.data);
      }
    };

    fetchDraftRelationsCount();
  }, [
    isListView,
    document,
    documentId,
    countDraftRelations,
    collectionType,
    model,
    currentDocumentMeta.params,
  ]);
  const parentDocumentMetaToUpdate = documentHistory?.at(-2) ?? rootDocumentMeta;
  const parentDocumentData = useDocument(
    {
      documentId: parentDocumentMetaToUpdate?.documentId,
      model: parentDocumentMetaToUpdate?.model,
      collectionType: parentDocumentMetaToUpdate?.collectionType,
      params: parentDocumentMetaToUpdate?.params,
    },
    { skip: !parentDocumentMetaToUpdate }
  );
  const { getInitialFormValues } = useDoc();

  const isDocumentPublished =
    (document?.[PUBLISHED_AT_ATTRIBUTE_NAME] ||
      meta?.availableStatus.some((doc) => doc[PUBLISHED_AT_ATTRIBUTE_NAME] !== null)) &&
    document?.status !== 'modified';

  if (!schema?.options?.draftAndPublish) {
    return null;
  }

  const performPublish = async () => {
    setSubmitting(true);

    try {
      const { errors } = await validate(true, {
        status: 'published',
      });
      if (errors) {
        const hasUnreadableRequiredField = Object.keys(schema.attributes).some((fieldName) => {
          const attribute = schema.attributes[fieldName];

          return attribute?.required && !(canReadFields ?? []).includes(fieldName);
        });

        if (hasUnreadableRequiredField) {
          toggleNotification({
            type: 'danger',
            message: formatMessage({
              id: 'content-manager.validation.error.unreadable-required-field',
              defaultMessage:
                'Your current permissions prevent access to certain required fields. Please request access from an administrator to proceed.',
            }),
          });
        } else {
          toggleNotification({
            type: 'danger',
            message: formatMessage({
              id: 'content-manager.validation.error',
              defaultMessage:
                'There are validation errors in your document. Please fix them before saving.',
            }),
          });
        }
        return;
      }
      const { data } = handleInvisibleAttributes(transformData(formValues), {
        schema,
        components,
      });
      const res = await publish(
        {
          collectionType,
          model,
          documentId,
          params: currentDocumentMeta.params,
        },
        data
      );

      // Reset form if successful
      if ('data' in res) {
        resetForm();
      }

      if ('data' in res && collectionType !== SINGLE_TYPES) {
        /**
         * TODO: refactor the router so we can just do `../${res.data.documentId}` instead of this.
         */
        if (idToPublish === 'create' && !fromRelationModal) {
          navigate({
            pathname: `../${collectionType}/${model}/${res.data.documentId}`,
            search: rawQuery,
          });
        } else if (fromRelationModal) {
          const newRelation = {
            documentId: res.data.documentId,
            collectionType,
            model,
            params: currentDocumentMeta.params,
          };

          /*
           * Update, if needed, the parent relation with the newly published document.
           * Check if in history we have the parent relation otherwise use the
           * rootDocument
           */
          if (
            fieldToConnect &&
            documentHistory &&
            (parentDocumentMetaToUpdate.documentId ||
              parentDocumentMetaToUpdate.collectionType === SINGLE_TYPES)
          ) {
            const parentDataToUpdate =
              parentDocumentMetaToUpdate.collectionType === SINGLE_TYPES
                ? getInitialFormValues()
                : parentDocumentData.getInitialFormValues();
            const metaDocumentToUpdate = documentHistory.at(-2) ?? rootDocumentMeta;

            const dataToUpdate = connectRelationToParent(
              parentDataToUpdate,
              fieldToConnect,
              res.data,
              fieldToConnectUID
            );

            try {
              const updateRes = await updateDocumentMutation({
                collectionType: metaDocumentToUpdate.collectionType,
                model: metaDocumentToUpdate.model,
                documentId:
                  metaDocumentToUpdate.collectionType !== SINGLE_TYPES
                    ? metaDocumentToUpdate.documentId
                    : undefined,
                params: metaDocumentToUpdate.params,
                data: dataToUpdate,
              });

              if ('error' in updateRes) {
                toggleNotification({ type: 'danger', message: formatAPIError(updateRes.error) });
                return;
              }
            } catch (err) {
              toggleNotification({
                type: 'danger',
                message: formatMessage({
                  id: 'notification.error',
                  defaultMessage: 'An error occurred',
                }),
              });

              throw err;
            }
          }

          dispatch({
            type: 'GO_TO_CREATED_RELATION',
            payload: { document: newRelation, shouldBypassConfirmation: true },
          });
        }
      } else if (
        'error' in res &&
        isBaseQueryError(res.error) &&
        res.error.name === 'ValidationError'
      ) {
        setErrors(formatValidationErrors(res.error));
      }
    } finally {
      setSubmitting(false);
      if (onPreview) {
        onPreview();
      }
    }
  };

  const totalDraftRelations = localCountOfDraftRelations + serverCountOfDraftRelations;
  // TODO skipping this for now as there is a bug with the draft relation count that will be worked on separately
  // see RFC "Count draft relations" in Notion
  const enableDraftRelationsCount = false;
  const hasDraftRelations = enableDraftRelationsCount && totalDraftRelations > 0;

  return {
    loading: isLoading,
    position: ['panel', 'preview', 'relation-modal'],
    /**
     * Disabled when:
     *  - currently if you're cloning a document we don't support publish & clone at the same time.
     *  - the form is submitting
     *  - the active tab is the published tab
     *  - the document is already published & not modified
     *  - the document is being created & not modified
     *  - the user doesn't have the permission to publish
     */
    disabled:
      isCloning ||
      isSubmitting ||
      isLoadingDraftRelations ||
      activeTab === 'published' ||
      (!modified && isDocumentPublished) ||
      (!modified && !document?.documentId) ||
      !canPublish,
    label: formatMessage({
      id: 'app.utils.publish',
      defaultMessage: 'Publish',
    }),
    onClick: async () => {
      if (hasDraftRelations) {
        // In this case we need to show the user a confirmation dialog.
        // Return from the onClick and let the dialog handle the process.
        return;
      }

      await performPublish();
    },
    dialog: hasDraftRelations
      ? {
          type: 'dialog',
          variant: 'danger',
          footer: null,
          title: formatMessage({
            id: getTranslation(`popUpwarning.warning.bulk-has-draft-relations.title`),
            defaultMessage: 'Confirmation',
          }),
          content: formatMessage(
            {
              id: getTranslation(`popUpwarning.warning.bulk-has-draft-relations.message`),
              defaultMessage:
                'This entry is related to {count, plural, one {# draft entry} other {# draft entries}}. Publishing it could leave broken links in your app.',
            },
            {
              count: totalDraftRelations,
            }
          ),
          onConfirm: async () => {
            await performPublish();
          },
        }
      : undefined,
  };
};

PublishAction.type = 'publish';
PublishAction.position = ['panel', 'preview', 'relation-modal'];

const UpdateAction: DocumentActionComponent = ({
  activeTab,
  documentId,
  model,
  collectionType,
}) => {
  const navigate = useNavigate();
  const { toggleNotification } = useNotification();
  const { _unstableFormatValidationErrors: formatValidationErrors } = useAPIErrorHandler();
  const cloneMatch = useMatch(CLONE_PATH);
  const isCloning = cloneMatch !== null;
  const { formatMessage } = useIntl();
  const { create, update, clone, isLoading } = useDocumentActions();
  const {
    currentDocument: { components },
  } = useDocumentContext('UpdateAction');
  const [{ rawQuery }] = useQueryParams();
  const onPreview = usePreviewContext('UpdateAction', (state) => state.onPreview, false);
  const { getInitialFormValues } = useDoc();

  const isSubmitting = useForm('UpdateAction', ({ isSubmitting }) => isSubmitting);
  const modified = useForm('UpdateAction', ({ modified }) => modified);
  const setSubmitting = useForm('UpdateAction', ({ setSubmitting }) => setSubmitting);
  const initialValues = useForm('UpdateAction', ({ initialValues }) => initialValues);
  const document = useForm('UpdateAction', ({ values }) => values);
  const validate = useForm('UpdateAction', (state) => state.validate);
  const setErrors = useForm('UpdateAction', (state) => state.setErrors);
  const resetForm = useForm('UpdateAction', ({ resetForm }) => resetForm);

  const dispatch = useRelationModal('UpdateAction', (state) => state.dispatch);

  // need to discriminate if the update is coming from a relation modal or in the edit view
  const relationContext = useRelationModal('UpdateAction', () => true, false);
  const relationalModalSchema = useRelationModal(
    'UpdateAction',
    (state) => state.currentDocument.schema,
    false
  );
  const fieldToConnect = useRelationModal(
    'UpdateAction',
    (state) => state.state.fieldToConnect,
    false
  );
  const fieldToConnectUID = useRelationModal(
    'PublishAction',
    (state) => state.state.fieldToConnectUID,
    false
  );
  const documentHistory = useRelationModal(
    'UpdateAction',
    (state) => state.state.documentHistory,
    false
  );
  const rootDocumentMeta = useRelationModal('UpdateAction', (state) => state.rootDocumentMeta);
  const fromRelationModal = relationContext != undefined;

  const { currentDocumentMeta } = useDocumentContext('UpdateAction');
  const [updateDocumentMutation] = useUpdateDocumentMutation();
  const { _unstableFormatAPIError: formatAPIError } = useAPIErrorHandler();
  const parentDocumentMetaToUpdate = documentHistory?.at(-2) ?? rootDocumentMeta;
  const parentDocumentData = useDocument(
    {
      documentId: parentDocumentMetaToUpdate?.documentId,
      model: parentDocumentMetaToUpdate?.model,
      collectionType: parentDocumentMetaToUpdate?.collectionType,
      params: parentDocumentMetaToUpdate?.params,
    },
    { skip: !parentDocumentMetaToUpdate }
  );
  const { schema } = useDoc();

  const handleUpdate = React.useCallback(async () => {
    setSubmitting(true);

    try {
      if (!modified) {
        return;
      }

      const { errors } = await validate(true, {
        status: 'draft',
      });

      if (errors) {
        toggleNotification({
          type: 'danger',
          message: formatMessage({
            id: 'content-manager.validation.error',
            defaultMessage:
              'There are validation errors in your document. Please fix them before saving.',
          }),
        });

        return;
      }
      if (isCloning) {
        const res = await clone(
          {
            model,
            documentId: cloneMatch.params.origin!,
            params: currentDocumentMeta.params,
          },
          transformData(document)
        );

        if ('data' in res) {
          navigate(
            {
              pathname: `../${res.data.documentId}`,
              search: rawQuery,
            },
            { relative: 'path' }
          );
        } else if (
          'error' in res &&
          isBaseQueryError(res.error) &&
          res.error.name === 'ValidationError'
        ) {
          setErrors(formatValidationErrors(res.error));
        }
      } else if (documentId || collectionType === SINGLE_TYPES) {
        const { data } = handleInvisibleAttributes(transformData(document), {
          schema: fromRelationModal ? relationalModalSchema : schema,
          initialValues,
          components,
        });
        const res = await update(
          {
            collectionType,
            model,
            documentId,
            params: currentDocumentMeta.params,
          },
          data
        );

        if ('error' in res && isBaseQueryError(res.error) && res.error.name === 'ValidationError') {
          setErrors(formatValidationErrors(res.error));
        } else {
          resetForm();
        }
      } else {
        const { data } = handleInvisibleAttributes(transformData(document), {
          schema: fromRelationModal ? relationalModalSchema : schema,
          initialValues,
          components,
        });
        const res = await create(
          {
            model,
            params: currentDocumentMeta.params,
          },
          data
        );

        if ('data' in res && collectionType !== SINGLE_TYPES) {
          if (fromRelationModal) {
            const createdRelation = {
              documentId: res.data.documentId,
              collectionType,
              model,
              params: currentDocumentMeta.params,
            };
            /*
             * Update, if needed, the parent relation with the newly published document.
             * Check if in history we have the parent relation otherwise use the
             * rootDocument
             */
            if (
              fieldToConnect &&
              documentHistory &&
              (parentDocumentMetaToUpdate.documentId ||
                parentDocumentMetaToUpdate.collectionType === SINGLE_TYPES)
            ) {
              const parentDataToUpdate =
                parentDocumentMetaToUpdate.collectionType === SINGLE_TYPES
                  ? getInitialFormValues()
                  : parentDocumentData.getInitialFormValues();

              const dataToUpdate = connectRelationToParent(
                parentDataToUpdate,
                fieldToConnect,
                res.data,
                fieldToConnectUID
              );

              try {
                const updateRes = await updateDocumentMutation({
                  collectionType: parentDocumentMetaToUpdate.collectionType,
                  model: parentDocumentMetaToUpdate.model,
                  documentId:
                    parentDocumentMetaToUpdate.collectionType !== SINGLE_TYPES
                      ? parentDocumentMetaToUpdate.documentId
                      : undefined,
                  params: parentDocumentMetaToUpdate.params,
                  data: {
                    ...dataToUpdate,
                  },
                });
                if ('error' in updateRes) {
                  toggleNotification({ type: 'danger', message: formatAPIError(updateRes.error) });
                  return;
                }
              } catch (err) {
                toggleNotification({
                  type: 'danger',
                  message: formatMessage({
                    id: 'notification.error',
                    defaultMessage: 'An error occurred',
                  }),
                });

                throw err;
              }
            }

            dispatch({
              type: 'GO_TO_CREATED_RELATION',
              payload: { document: createdRelation, shouldBypassConfirmation: true },
            });
          } else {
            navigate(
              {
                pathname: `../${res.data.documentId}`,
                search: rawQuery,
              },
              { replace: true, relative: 'path' }
            );
          }
        } else if (
          'error' in res &&
          isBaseQueryError(res.error) &&
          res.error.name === 'ValidationError'
        ) {
          setErrors(formatValidationErrors(res.error));
        }
      }
    } finally {
      setSubmitting(false);
      if (onPreview) {
        onPreview();
      }
    }
  }, [
    setSubmitting,
    modified,
    validate,
    isCloning,
    documentId,
    collectionType,
    toggleNotification,
    formatMessage,
    clone,
    model,
    cloneMatch?.params.origin,
    currentDocumentMeta.params,
    document,
    navigate,
    rawQuery,
    setErrors,
    formatValidationErrors,
    update,
    resetForm,
    create,
    fromRelationModal,
    fieldToConnect,
    documentHistory,
    parentDocumentMetaToUpdate,
    dispatch,
    getInitialFormValues,
    parentDocumentData,
    fieldToConnectUID,
    updateDocumentMutation,
    formatAPIError,
    onPreview,
    initialValues,
    schema,
    components,
    relationalModalSchema,
  ]);

  // Auto-save on CMD+S or CMD+Enter on macOS, and CTRL+S or CTRL+Enter on Windows/Linux
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleUpdate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleUpdate]);

  return {
    loading: isLoading,
    /**
     * Disabled when:
     * - the form is submitting
     * - the document is not modified & we're not cloning (you can save a clone entity straight away)
     * - the active tab is the published tab
     */
    disabled: isSubmitting || (!modified && !isCloning) || activeTab === 'published',
    label: formatMessage({
      id: 'global.save',
      defaultMessage: 'Save',
    }),
    onClick: handleUpdate,
    position: ['panel', 'preview', 'relation-modal'],
  };
};

UpdateAction.type = 'update';
UpdateAction.position = ['panel', 'preview', 'relation-modal'];

const UNPUBLISH_DRAFT_OPTIONS = {
  KEEP: 'keep',
  DISCARD: 'discard',
};

const UnpublishAction: DocumentActionComponent = ({
  activeTab,
  documentId,
  model,
  collectionType,
  document,
}) => {
  const { formatMessage } = useIntl();
  const { schema } = useDoc();
  const canPublish = useDocumentRBAC('UnpublishAction', ({ canPublish }) => canPublish);
  const { unpublish } = useDocumentActions();
  const [{ query }] = useQueryParams();
  const params = React.useMemo(() => buildValidParams(query), [query]);
  const { toggleNotification } = useNotification();
  const [shouldKeepDraft, setShouldKeepDraft] = React.useState(true);

  const isDocumentModified = document?.status === 'modified';

  const handleChange = (value: string) => {
    setShouldKeepDraft(value === UNPUBLISH_DRAFT_OPTIONS.KEEP);
  };

  if (!schema?.options?.draftAndPublish) {
    return null;
  }

  return {
    disabled:
      !canPublish ||
      activeTab === 'published' ||
      (document?.status !== 'published' && document?.status !== 'modified'),
    label: formatMessage({
      id: 'app.utils.unpublish',
      defaultMessage: 'Unpublish',
    }),
    icon: <Cross />,
    onClick: async () => {
      /**
       * return if there's no id & we're in a collection type, or the status modified
       * for either collection type because we use a dialog to handle the process in
       * the latter case.
       */
      if ((!documentId && collectionType !== SINGLE_TYPES) || isDocumentModified) {
        if (!documentId) {
          // This should never, ever, happen.
          console.error(
            "You're trying to unpublish a document without an id, this is likely a bug with Strapi. Please open an issue."
          );

          toggleNotification({
            message: formatMessage({
              id: 'content-manager.actions.unpublish.error',
              defaultMessage: 'An error occurred while trying to unpublish the document.',
            }),
            type: 'danger',
          });
        }

        return;
      }

      await unpublish({
        collectionType,
        model,
        documentId,
        params,
      });
    },
    dialog: isDocumentModified
      ? {
          type: 'dialog',
          title: formatMessage({
            id: 'app.components.ConfirmDialog.title',
            defaultMessage: 'Confirmation',
          }),
          content: (
            <Flex alignItems="flex-start" direction="column" gap={6}>
              <Flex width="100%" direction="column" gap={2}>
                <WarningCircle width="24px" height="24px" fill="danger600" />
                <Typography tag="p" variant="omega" textAlign="center">
                  {formatMessage({
                    id: 'content-manager.actions.unpublish.dialog.body',
                    defaultMessage: 'Are you sure?',
                  })}
                </Typography>
              </Flex>
              <Radio.Group
                defaultValue={UNPUBLISH_DRAFT_OPTIONS.KEEP}
                name="discard-options"
                aria-label={formatMessage({
                  id: 'content-manager.actions.unpublish.dialog.radio-label',
                  defaultMessage: 'Choose an option to unpublish the document.',
                })}
                onValueChange={handleChange}
              >
                <Radio.Item checked={shouldKeepDraft} value={UNPUBLISH_DRAFT_OPTIONS.KEEP}>
                  {formatMessage({
                    id: 'content-manager.actions.unpublish.dialog.option.keep-draft',
                    defaultMessage: 'Keep draft',
                  })}
                </Radio.Item>
                <Radio.Item checked={!shouldKeepDraft} value={UNPUBLISH_DRAFT_OPTIONS.DISCARD}>
                  {formatMessage({
                    id: 'content-manager.actions.unpublish.dialog.option.replace-draft',
                    defaultMessage: 'Replace draft',
                  })}
                </Radio.Item>
              </Radio.Group>
            </Flex>
          ),
          onConfirm: async () => {
            if (!documentId && collectionType !== SINGLE_TYPES) {
              // This should never, ever, happen.
              console.error(
                "You're trying to unpublish a document without an id, this is likely a bug with Strapi. Please open an issue."
              );

              toggleNotification({
                message: formatMessage({
                  id: 'content-manager.actions.unpublish.error',
                  defaultMessage: 'An error occurred while trying to unpublish the document.',
                }),
                type: 'danger',
              });
            }

            await unpublish(
              {
                collectionType,
                model,
                documentId,
                params,
              },
              !shouldKeepDraft
            );
          },
        }
      : undefined,
    variant: 'danger',
    position: ['panel', 'table-row'],
  };
};

UnpublishAction.type = 'unpublish';
UnpublishAction.position = 'panel';

const DiscardAction: DocumentActionComponent = ({
  activeTab,
  documentId,
  model,
  collectionType,
  document,
}) => {
  const { formatMessage } = useIntl();
  const { schema } = useDoc();
  const canUpdate = useDocumentRBAC('DiscardAction', ({ canUpdate }) => canUpdate);
  const { discard, isLoading } = useDocumentActions();
  const [{ query }] = useQueryParams();
  const params = React.useMemo(() => buildValidParams(query), [query]);

  if (!schema?.options?.draftAndPublish) {
    return null;
  }

  return {
    disabled: !canUpdate || activeTab === 'published' || document?.status !== 'modified',
    label: formatMessage({
      id: 'content-manager.actions.discard.label',
      defaultMessage: 'Discard changes',
    }),
    icon: <Cross />,
    position: ['panel', 'table-row'],
    variant: 'danger',
    dialog: {
      type: 'dialog',
      title: formatMessage({
        id: 'app.components.ConfirmDialog.title',
        defaultMessage: 'Confirmation',
      }),
      content: (
        <Flex direction="column" gap={2}>
          <WarningCircle width="24px" height="24px" fill="danger600" />
          <Typography tag="p" variant="omega" textAlign="center">
            {formatMessage({
              id: 'content-manager.actions.discard.dialog.body',
              defaultMessage: 'Are you sure?',
            })}
          </Typography>
        </Flex>
      ),
      loading: isLoading,
      onConfirm: async () => {
        await discard({
          collectionType,
          model,
          documentId,
          params,
        });
      },
    },
  };
};

DiscardAction.type = 'discard';
DiscardAction.position = 'panel';

const DEFAULT_ACTIONS = [PublishAction, UpdateAction, UnpublishAction, DiscardAction];

export { DocumentActions, DocumentActionsMenu, DocumentActionButton, DEFAULT_ACTIONS };
export type {
  DocumentActionDescription,
  DocumentActionPosition,
  DialogOptions,
  NotificationOptions,
  ModalOptions,
};
