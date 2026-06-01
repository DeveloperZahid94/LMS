import { Directive, Input, OnDestroy, OnInit, TemplateRef, ViewContainerRef, effect, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { FeatureKey } from '@lms/shared';

/**
 * Structurally renders content only when the current tenant has the named feature enabled.
 *
 * <button *lmsHasFeature="'QR_ATTENDANCE'">Scan QR</button>
 */
@Directive({
  selector: '[lmsHasFeature]',
  standalone: true,
})
export class HasFeatureDirective implements OnInit {
  private tpl = inject(TemplateRef<unknown>);
  private vcr = inject(ViewContainerRef);
  private auth = inject(AuthService);

  @Input('lmsHasFeature') feature!: FeatureKey;

  constructor() {
    effect(() => {
      // Re-render whenever features signal changes
      this.auth.features();
      this.render();
    });
  }

  ngOnInit() { this.render(); }

  private render() {
    this.vcr.clear();
    if (this.auth.hasFeature(this.feature)) {
      this.vcr.createEmbeddedView(this.tpl);
    }
  }
}
