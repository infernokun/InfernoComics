import { Observable } from "rxjs";

export interface ObservableMap {
  [key: string]: Observable<any>;
}

export interface FucntionMap {
  [key: string]: Function;
}

export class SimpleFormData {
  preFilledData?: Map<string, any>;
  questions: QuestionBase[];
  typeName: string;
  result: Map<string, string>;
  action?: Observable<any>;
  asyncData?: Observable<any>;
  function?: Function;
  constructor(_typeName: string, _questions: QuestionBase[] = []) {
    this.typeName = _typeName;
    this.questions = _questions;
    this.result = new Map<string, string>();
  }

  fillObject(obj: Object) {
    if (this.preFilledData) {
      for (const kv of this.preFilledData.entries()) {
        Reflect.set(obj, kv[0], kv[1]);
      }
    }
    for (const kv of this.result.entries()) {
      Reflect.set(obj, kv[0], kv[1]);
    }
  }
  getAttrsToMap(obj: Object): Map<string, string> {
    const arr = new Map<string, string>();
    for (const key of Reflect.ownKeys(obj)) {
      const temp = Reflect.get(obj, key);
      if (temp !== undefined) {
        arr.set(String(key), temp);
      }
    }
    return arr;
  }
}

export class QuestionBase {
  cb: Function;
  value: string | undefined;
  key: string;
  label: string;
  required: boolean;
  order: number;
  controlType: string;
  type: string;
  options: { key: string; value: string, disabled: boolean }[];
  options2: { key: string; value: string }[];
  dependentQuestions: Map<string, QuestionBase> | undefined; //key is the show val
  size: number = 50;
  action?: Function;
  neededEnum?: { key: string, value: string[] };
  isHiddenByDefault?: boolean;
  asyncData?: Observable<any>;
  hint?: string;
  dataBoolean?: boolean = false;
  function?: Function;

  constructor(
    options: {
      cb?: Function; //for updating the results map easily
      value?: string;
      key?: string;
      label?: string;
      required?: boolean;
      order?: number;
      controlType?: string;
      type?: string;
      options?: { key: string; value: string, disabled: boolean }[];
      options2?: { key: string; value: string }[];
      dependentQuestions?: Map<string, QuestionBase>;
      action?: Function;
      neededEnum?: { key: string, value: string[] };
      asyncData?: Observable<any>;
      hint?: string;
      size?: number;
      dataBoolean?: boolean;
      function?: Function;

    } = {}, isHiddenByDefault: boolean = false
  ) {
    this.cb = options.cb ?? ((k: any, v: any) => { });
    this.dependentQuestions = options.dependentQuestions;
    this.value = options.value;
    this.key = options.key || '';
    this.label = options.label || '';
    this.required = options.required ?? true;
    this.order = options.order === undefined ? 1 : options.order;
    this.controlType = options.controlType || '';
    this.type = options.type || '';
    this.options = options.options || [];
    this.options2 = options.options2 || [];
    this.action = options.action ?? ((...argsv: any[]) => { });
    this.neededEnum = options.neededEnum;
    this.isHiddenByDefault = isHiddenByDefault;
    this.asyncData = options.asyncData || undefined;
    this.hint = options.hint || undefined;
    this.size = options.size || this.size;
    this.dataBoolean = options.dataBoolean || false;
    this.function = options.function || undefined;
  }
}

export class PopupQuestion extends QuestionBase {
  override type: string = 'popup';
}

export class DropDownQuestion extends QuestionBase {
  override type: string = 'dropdown';
}

export class NumberQuestion extends QuestionBase {
  override type: string = 'number';
}

export class TextQuestion extends QuestionBase {
  override type: string = 'text';
}

export class PasswordQuestion extends QuestionBase {
  override type: string = 'password';
}

export class TextAreaQuestion extends QuestionBase {
  override type: string = 'textarea';
  override size: number = 350;
}

export class DateQuestion extends QuestionBase {
  override type: string = 'date';
}

export class RadioQuestion extends QuestionBase {
  override type: string = 'radio';
}

export class UploadBoxQuestion extends QuestionBase {
  override type: string = 'uploadbox';
}

export class CheckBoxQuestion extends QuestionBase {
  override type: string = 'checkbox';
}

export class ButtonQuestion extends QuestionBase {
  override type: string = 'button';
}
