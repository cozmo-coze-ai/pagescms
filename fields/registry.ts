import { Field } from "@/types/field";
import { z } from "zod";
// Only the field types the cms-config schema actually uses are kept —
// the rest of the upstream PagesCMS field library was removed.
import * as booleanField from "@/fields/core/boolean";
import * as imageField from "@/fields/core/image";
import * as richTextField from "@/fields/core/rich-text";
import * as selectField from "@/fields/core/select";
import * as stringField from "@/fields/core/string";
import * as textField from "@/fields/core/text";

type FieldModule = {
  label?: string;
  schema?: (...args: any[]) => z.ZodTypeAny;
  defaultValue?: any;
  read?: (...args: any[]) => any;
  write?: (...args: any[]) => any;
  EditComponent?: React.ComponentType<any>;
  ViewComponent?: React.ComponentType<any>;
};

const fieldTypes = new Set<string>();
const labels: Record<string, string> = {};
const schemas: Record<string, (field: Field, configObject?: Record<string, any>) => z.ZodTypeAny> = {};
const defaultValues: Record<string, any> = {};
const readFns: Record<string, (value: any, field: Field, configObject?: Record<string, any>) => void> = {};
const writeFns: Record<string, (value: any, field: Field, configObject?: Record<string, any>) => void> = {};
const editComponents: Record<string, React.ComponentType<any>> = {};
const viewComponents: Record<string, React.ComponentType<any>> = {};

const registerField = (fieldName: string, fieldModule: FieldModule) => {
  fieldTypes.add(fieldName);

  if (fieldModule.label) labels[fieldName] = fieldModule.label;
  if (fieldModule.schema) schemas[fieldName] = fieldModule.schema;
  if (fieldModule.defaultValue !== undefined) defaultValues[fieldName] = fieldModule.defaultValue;
  if (fieldModule.read) readFns[fieldName] = fieldModule.read;
  if (fieldModule.write) writeFns[fieldName] = fieldModule.write;
  if (fieldModule.EditComponent) editComponents[fieldName] = fieldModule.EditComponent;
  if (fieldModule.ViewComponent) viewComponents[fieldName] = fieldModule.ViewComponent;
};

registerField("boolean", booleanField);
registerField("image", imageField);
registerField("rich-text", richTextField);
registerField("select", selectField);
registerField("string", stringField);
registerField("text", textField);

export { labels, schemas, readFns, writeFns, defaultValues, editComponents, viewComponents, fieldTypes };
