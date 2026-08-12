export type NeonDialogName = "mode" | "archive" | "settings" | "pause" | "upgrade" | "result";

type CancelPolicy = "close" | "request" | "block";

export interface DialogRegistration {
  readonly element: HTMLDialogElement;
  readonly cancelPolicy: CancelPolicy;
  readonly onCancel?: () => void;
}

interface ActiveDialog {
  readonly name: NeonDialogName;
  readonly restoreFocus: HTMLElement | null;
}

export class DialogController {
  readonly #document: Document;
  readonly #registrations: ReadonlyMap<NeonDialogName, DialogRegistration>;
  readonly #removeListeners: (() => void)[] = [];
  #active: ActiveDialog | null = null;
  #restoreOnClose = true;
  #disposed = false;

  constructor(
    document: Document,
    registrations: Readonly<Record<NeonDialogName, DialogRegistration>>,
  ) {
    this.#document = document;
    this.#registrations = new Map(
      Object.entries(registrations) as [NeonDialogName, DialogRegistration][],
    );

    if (this.#registrations.size !== 6) {
      throw new Error("Neon requires exactly six registered dialogs.");
    }

    for (const [name, registration] of this.#registrations) {
      if (!(registration.element instanceof HTMLDialogElement)) {
        throw new TypeError(`Neon ${name} dialog registration must reference a dialog element.`);
      }
      const handleCancel = (event: Event): void => {
        event.preventDefault();
        if (this.#active?.name !== name) return;
        if (registration.cancelPolicy === "close") {
          registration.onCancel?.();
          this.close(name);
        } else if (registration.cancelPolicy === "request") {
          registration.onCancel?.();
        }
      };
      const handleClose = (): void => {
        if (this.#active?.name !== name) return;
        const restoreFocus = this.#active.restoreFocus;
        const shouldRestore = this.#restoreOnClose;
        this.#active = null;
        this.#restoreOnClose = true;
        if (shouldRestore && restoreFocus?.isConnected) {
          restoreFocus.focus({ preventScroll: true });
        }
      };
      registration.element.addEventListener("cancel", handleCancel);
      registration.element.addEventListener("close", handleClose);
      this.#removeListeners.push(() => {
        registration.element.removeEventListener("cancel", handleCancel);
        registration.element.removeEventListener("close", handleClose);
      });
    }
  }

  get active(): NeonDialogName | null {
    return this.#active?.name ?? null;
  }

  open(name: NeonDialogName, initialFocus: HTMLElement): void {
    this.#assertActive();
    if (!initialFocus.isConnected || initialFocus.matches(":disabled,[aria-disabled='true']")) {
      throw new Error(`Neon ${name} dialog requires an enabled initial-focus control.`);
    }
    if (this.#active?.name === name) return;

    const registration = this.#requireRegistration(name);
    const restoreFocus =
      this.#document.activeElement instanceof HTMLElement ? this.#document.activeElement : null;
    if (this.#active !== null) this.close(this.#active.name, false);
    this.#active = { name, restoreFocus };
    registration.element.showModal();
    initialFocus.focus({ preventScroll: true });
  }

  close(name: NeonDialogName, restoreFocus = true): void {
    this.#assertActive();
    const registration = this.#requireRegistration(name);
    if (this.#active?.name !== name) {
      if (registration.element.open) {
        throw new Error(`Neon ${name} dialog is open outside DialogController ownership.`);
      }
      return;
    }
    this.#restoreOnClose = restoreFocus;
    registration.element.close();
  }

  closeActive(restoreFocus = true): void {
    this.#assertActive();
    if (this.#active !== null) this.close(this.#active.name, restoreFocus);
  }

  dispose(): void {
    if (this.#disposed) return;
    if (this.#active !== null) this.close(this.#active.name, false);
    this.#disposed = true;
    for (const remove of this.#removeListeners.splice(0)) remove();
  }

  #requireRegistration(name: NeonDialogName): DialogRegistration {
    const registration = this.#registrations.get(name);
    if (registration === undefined) throw new RangeError(`Unknown Neon dialog: ${name}`);
    return registration;
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("Neon DialogController is disposed.");
  }
}
