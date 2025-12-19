import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Key, ShieldCheck } from "lucide-react";

interface RecoveryPinDialogProps {
    mode: "create" | "recover";
    onSubmit: (pin: string) => Promise<void>;
    onCancel?: () => void;
    isLoading?: boolean;
    error?: string | null;
}

export default function RecoveryPinDialog({
    mode,
    onSubmit,
    onCancel,
    isLoading = false,
    error = null,
}: RecoveryPinDialogProps) {
    const [pin, setPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);

        if (pin.length < 6) {
            setLocalError("PIN must be at least 6 characters");
            return;
        }

        if (mode === "create" && pin !== confirmPin) {
            setLocalError("PINs do not match");
            return;
        }

        try {
            await onSubmit(pin);
        } catch (err: unknown) {
            if (err instanceof Error) {
                setLocalError(err.message);
            } else {
                setLocalError("An error occurred");
            }
        }
    };

    const displayError = localError || error;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#161B22] border border-[#30363D] rounded-xl p-6 shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    {mode === "create" ? (
                        <ShieldCheck className="w-8 h-8 text-[#238636]" />
                    ) : (
                        <Key className="w-8 h-8 text-[#58A6FF]" />
                    )}
                    <div>
                        <h2 className="text-xl font-semibold text-[#C9D1D9]">
                            {mode === "create" ? "Create Recovery PIN" : "Enter Recovery PIN"}
                        </h2>
                        <p className="text-sm text-gray-400">
                            {mode === "create"
                                ? "This PIN will protect your encryption keys"
                                : "Enter your PIN to recover your encryption keys"}
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <Label htmlFor="pin" className="text-[#C9D1D9]">
                            {mode === "create" ? "Create PIN" : "Recovery PIN"}
                        </Label>
                        <Input
                            id="pin"
                            type="password"
                            placeholder="Enter 6+ character PIN"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            className="mt-1 bg-[#0D1117] border-[#30363D] text-[#C9D1D9]"
                            autoFocus
                            disabled={isLoading}
                        />
                    </div>

                    {mode === "create" && (
                        <div>
                            <Label htmlFor="confirmPin" className="text-[#C9D1D9]">
                                Confirm PIN
                            </Label>
                            <Input
                                id="confirmPin"
                                type="password"
                                placeholder="Confirm your PIN"
                                value={confirmPin}
                                onChange={(e) => setConfirmPin(e.target.value)}
                                className="mt-1 bg-[#0D1117] border-[#30363D] text-[#C9D1D9]"
                                disabled={isLoading}
                            />
                        </div>
                    )}

                    {displayError && (
                        <div className="text-red-400 text-sm bg-red-900/20 p-2 rounded">
                            {displayError}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        {onCancel && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onCancel}
                                disabled={isLoading}
                                className="flex-1 bg-[#0D1117] border-[#30363D] text-[#C9D1D9] hover:bg-[#30363D]"
                            >
                                Cancel
                            </Button>
                        )}
                        <Button
                            type="submit"
                            disabled={isLoading || pin.length < 6}
                            className="flex-1 bg-[#238636] hover:bg-[#238636]/90"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {mode === "create" ? "Saving..." : "Recovering..."}
                                </>
                            ) : mode === "create" ? (
                                "Save PIN"
                            ) : (
                                "Recover Keys"
                            )}
                        </Button>
                    </div>
                </form>

                <p className="mt-4 text-xs text-gray-500 text-center">
                    {mode === "create"
                        ? "Remember this PIN! You'll need it to recover your messages on new devices."
                        : "This is the PIN you created when you first registered."}
                </p>
            </div>
        </div>
    );
}
