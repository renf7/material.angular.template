import {ComponentPortal, DomPortalOutlet} from '@angular/cdk/portal';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {DomSanitizer} from '@angular/platform-browser';
import {
  ApplicationRef,
  Component,
  ComponentFactoryResolver,
  ElementRef,
  EventEmitter,
  Injectable,
  Injector,
  Input,
  NgZone,
  OnDestroy,
  Output,
  SecurityContext,
  ViewContainerRef,
} from '@angular/core';
import {Observable, Subscription} from 'rxjs';
import {shareReplay, take, tap} from 'rxjs/operators';
import {HeaderLink} from './header-link';

@Injectable({providedIn: 'root'})
class DocFetcher {
  private _cache: Record<string, Observable<string>> = {};

  constructor(private _http: HttpClient) {}

  fetchDocument(url: string): Observable<string> {
    if (this._cache[url]) {
      return this._cache[url];
    }

    const stream = this._http.get(url, {responseType: 'text'}).pipe(shareReplay(1));
    return stream.pipe(tap(() => this._cache[url] = stream));
  }
}

@Component({
  selector: 'doc-viewer',
  template: 'Loading document...',
  standalone: true,
})
export class DocViewer implements OnDestroy {
  private _portalHosts: DomPortalOutlet[] = [];
  private _documentFetchSubscription: Subscription | undefined;

  @Input() name: string | undefined;

  /** The URL of the document to display. */
  @Input()
  set documentUrl(url: string | undefined) {
    if (url !== undefined) {
      this._fetchDocument(url);
    }
  }

  constructor(private _appRef: ApplicationRef,
              private _componentFactoryResolver: ComponentFactoryResolver,
              public _elementRef: ElementRef,
              private _injector: Injector,
              private _viewContainerRef: ViewContainerRef,
              private _ngZone: NgZone,
              private _domSanitizer: DomSanitizer,
              private _docFetcher: DocFetcher) {
  }

  /** Fetch a document by URL. */
  private _fetchDocument(url: string) {
    this._documentFetchSubscription?.unsubscribe();
    this._documentFetchSubscription = this._docFetcher.fetchDocument(url).subscribe(
      document => this.updateDocument(document),
      error => this.showError(url, error)
    );
  }

  /**
   * Updates the displayed document.
   * @param rawDocument The raw document content to show.
   */
  private updateDocument(rawDocument: string) {
    // Replace all relative fragment URLs with absolute fragment URLs. e.g. "#my-section" becomes
    // "/components/button/api#my-section". This is necessary because otherwise these fragment
    // links would redirect to "/#my-section".
    rawDocument = rawDocument.replace(/href="#([^"]*)"/g, (_m: string, fragmentUrl: string) => {
      const absoluteUrl = `${location.pathname}#${fragmentUrl}`;
      return `href="${this._domSanitizer.sanitize(SecurityContext.URL, absoluteUrl)}"`;
    });
    this._elementRef.nativeElement.innerHTML = rawDocument;
    this._loadComponents('header-link', HeaderLink);
  }

  /** Show an error that occurred when fetching a document. */
  private showError(url: string, error: HttpErrorResponse) {
    console.error(error);
    this._elementRef.nativeElement.innerText =
      `Failed to load document: ${url}. Error: ${error.statusText}`;
  }

  /** Instantiate a ExampleViewer for each example. */
  private _loadComponents(componentName: string, componentClass: any) {
    const exampleElements =
        this._elementRef.nativeElement.querySelectorAll(`[${componentName}]`);

    [...exampleElements].forEach((element: Element) => {
      const example = element.getAttribute(componentName);
      const region = element.getAttribute('region');
      const file = element.getAttribute('file');
      const portalHost = new DomPortalOutlet(
          element, this._componentFactoryResolver, this._appRef, this._injector);
      const examplePortal = new ComponentPortal(componentClass, this._viewContainerRef);
      const exampleViewer = portalHost.attach(examplePortal);
      this._portalHosts.push(portalHost);
    });
  }

  private _clearLiveExamples() {
    this._portalHosts.forEach(h => h.dispose());
    this._portalHosts = [];
  }

  ngOnDestroy() {
    this._clearLiveExamples();
    this._documentFetchSubscription?.unsubscribe();
  }
}
