import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/**
 * RF-04: intercepta el evento `error` de una `<img>` (URL rota, 404, host
 * caído) y reemplaza el `src` por un placeholder genérico — nunca deja el
 * ícono roto del navegador. No cubre el caso `avatarUrl === null` (eso ya
 * lo resuelve `AccountAvatarComponent` eligiendo el placeholder de
 * entrada, sin necesidad de que el `<img>` intente cargar nada y falle
 * primero) — son dos casos distintos a propósito, ver PROGRESS.md.
 */
@Directive({ selector: 'img[appImageFallback]' })
export class ImageFallbackDirective {
  private readonly el = inject(ElementRef<HTMLImageElement>);

  @HostListener('error')
  onError(): void {
    this.el.nativeElement.src = 'assets/avatar-placeholder.svg';
  }
}
