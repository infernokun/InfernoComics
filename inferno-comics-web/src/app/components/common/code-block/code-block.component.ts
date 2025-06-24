import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  ChangeDetectorRef,
  ViewChild,
} from '@angular/core';
import { CodeEditorComponent, CodeModel } from '@ngstack/code-editor';

@Component({
  selector: 'amaterasu-code-block',
  templateUrl: './code-block.component.html',
  styleUrls: ['./code-block.component.scss'],
  standalone: false,
})
export class CodeBlockComponent implements OnInit {
  @ViewChild(CodeEditorComponent, { static: false }) _codeEditor:
    | CodeEditorComponent
    | undefined;
  @Input() id: string = '';
  @Input() placeholder: string = '';
  @Input() readonly: boolean = false;
  @Input() versions: number[] = [];
  @Input() fileType: string = '';
  @Input() codeModel: CodeModel | undefined = {
    language: 'json',
    uri: 'main.json',
    value: '',
  };

  @Output() onVersionChange = new EventEmitter<number>();
  @Output() onChange = new EventEmitter<string>();

  isCopied = false;
  theme = 'vs-dark';

  options = {
    contextmenu: true,
    minimap: {
      enabled: true,
    },
  };

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges() {
    if (this.codeModel && this.fileType) {
      this.codeModel.language = this.fileType;
    }
    
    this.cdr.detectChanges();
  }

  ngOnInit() {
    if (this.codeModel) {
      this.codeModel.language = this.fileType;
    }
  }

  onCodeChanged(value: any) {}

  copyToClipboard() {
    navigator.clipboard.writeText(this.codeModel!.value).then(() => {
      this.isCopied = true;
      // Hide the check mark after 2 seconds
      setTimeout(() => {
        this.isCopied = false;
      }, 2000);
    });
  }
}
