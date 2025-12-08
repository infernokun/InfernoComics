import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { AppComponent } from './app.component';
import { ThemeService } from './services/theme/theme.service';
import { WebsocketService } from './services/websocket/websocket.service';
import { of, BehaviorSubject } from 'rxjs';
import { MaterialModule } from './material.module';
import { VersionInfoComponent } from './components/common/version-info/version-info.component';
import { ProcessingStatusIconComponent } from './components/common/processing-status-icon/processing-status-icon.component';

describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;
  let mockThemeService: jasmine.SpyObj<ThemeService>;
  let mockWebsocketService: jasmine.SpyObj<WebsocketService>;

  beforeEach(async () => {
    // Create spy objects for services
    mockThemeService = jasmine.createSpyObj<ThemeService>('ThemeService', ['toggleDarkMode']);
    mockThemeService.isDarkMode$ = of(false); // Default to light mode
    
    // Create proper BehaviorSubject for websocket connection
    const isConnectedSubject = new BehaviorSubject<boolean>(true);
    mockWebsocketService = jasmine.createSpyObj<WebsocketService>(
      'WebsocketService', 
      [], 
      { 
        isConnected$: isConnectedSubject 
      }
    );

    await TestBed.configureTestingModule({
      imports: [
        VersionInfoComponent,
        MaterialModule,
        RouterModule.forRoot([])
      ],
      declarations: [
        AppComponent,
        ProcessingStatusIconComponent
      ],
      providers: [
        { provide: ThemeService, useValue: mockThemeService },
        { provide: WebsocketService, useValue: mockWebsocketService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it('should have the correct title', () => {
    expect(component.title).toEqual('Inferno Comics');
  });

  it('should have the correct version', () => {
    // Note: This assumes APP_VERSION is imported correctly
    expect(component.version).toBeDefined();
  });

  it('should toggle dark mode when toggleTheme is called', () => {
    component.toggleTheme();
    expect(mockThemeService.toggleDarkMode).toHaveBeenCalled();
  });

  describe('ngOnInit', () => {
    it('should subscribe to theme changes', () => {
      spyOn(component['themeSubscription'], 'add');
      
      component.ngOnInit();
      
      // Verify subscription was created
      expect(component['themeSubscription']).toBeDefined();
    });

    it('should apply dark theme classes when dark mode is enabled', () => {
      // Create a mock element that mimics HTMLElement
      const mockElement = {
        classList: {
          add: jasmine.createSpy('addClass'),
          remove: jasmine.createSpy('removeClass')
        }
      } as any;

      // Temporarily replace document.documentElement
      const originalDocument = document;
      Object.defineProperty(window, 'document', {
        writable: true,
        value: {
          ...originalDocument,
          documentElement: mockElement
        }
      });

      // Set up theme service to emit dark mode
      mockThemeService.isDarkMode$ = of(true);
      
      component.ngOnInit();
      
      // Restore original document
      Object.defineProperty(window, 'document', {
        writable: true,
        value: originalDocument
      });
      
      // Verify classList methods were called
      expect(mockElement.classList.add).toHaveBeenCalledWith('dark-theme');
      expect(mockElement.classList.remove).toHaveBeenCalledWith('light-theme');
    });

    it('should apply light theme classes when light mode is enabled', () => {
      // Create a mock element that mimics HTMLElement
      const mockElement = {
        classList: {
          add: jasmine.createSpy('addClass'),
          remove: jasmine.createSpy('removeClass')
        }
      } as any;

      // Temporarily replace document.documentElement
      const originalDocument = document;
      Object.defineProperty(window, 'document', {
        writable: true,
        value: {
          ...originalDocument,
          documentElement: mockElement
        }
      });

      // Set up theme service to emit light mode
      mockThemeService.isDarkMode$ = of(false);
      
      component.ngOnInit();
      
      // Restore original document
      Object.defineProperty(window, 'document', {
        writable: true,
        value: originalDocument
      });
      
      // Verify classList methods were called
      expect(mockElement.classList.add).toHaveBeenCalledWith('light-theme');
      expect(mockElement.classList.remove).toHaveBeenCalledWith('dark-theme');
    });

    it('should subscribe to websocket connection status', () => {
      // Test the connection status change
      const newIsConnected$ = new BehaviorSubject<boolean>(false);
      (mockWebsocketService as any).isConnected$ = newIsConnected$;
      
      component.ngOnInit();
      
      expect(component.webSocketConnected).toBeFalse();
    });
  });

  describe('ngOnDestroy', () => {
    it('should unsubscribe from theme subscription', () => {
      spyOn(component['themeSubscription'], 'unsubscribe');
      
      component.ngOnDestroy();
      
      expect(component['themeSubscription'].unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Component Properties', () => {
    it('should have isDarkMode$ observable', () => {
      expect(component.isDarkMode$).toBeDefined();
    });

    it('should have webSocketConnected initialized to true', () => {
      expect(component.webSocketConnected).toBeTrue();
    });
  });
});