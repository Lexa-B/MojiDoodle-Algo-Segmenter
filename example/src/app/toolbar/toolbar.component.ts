import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-toolbar',
  standalone: true,
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.css',
})
export class ToolbarComponent {
  @Input() mode: 'draw' | 'lasso' = 'draw';
  @Input() maxCharacters = 3;
  @Output() modeChange = new EventEmitter<'draw' | 'lasso'>();
  @Output() maxCharactersChange = new EventEmitter<number>();
  @Output() undo = new EventEmitter<void>();
  @Output() clear = new EventEmitter<void>();

  setMode(mode: 'draw' | 'lasso') {
    this.modeChange.emit(mode);
  }

  onMaxCharsInput(event: Event) {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (value >= 1 && value <= 20) {
      this.maxCharactersChange.emit(value);
    }
  }
}
