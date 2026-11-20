import { forwardRef, useState, type ReactNode } from 'react';
import {
  Pressable as NativePressable,
  type PressableProps as NativePressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';

type PressedState = PressableStateCallbackType;

export type PressableProps = Omit<NativePressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle> | ((state: PressedState) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: PressedState) => ReactNode);
};

/**
 * React Native's Pressable, where `style` and `children` may still be
 * `({ pressed }) => ...` functions. Use this one, never Pressable from
 * 'react-native', when style depends on `pressed`.
 *
 * Why: NativeWind wraps every Pressable. On the phone (APK 2.3.1) a style
 * function passed through that wrapper was dropped, so buttons lost their
 * fill, height and padding: the white "Unlock" label sat invisible on the
 * white card and other buttons floated as bare text. Here the function is
 * resolved before the wrapper sees it, so only a plain style goes down.
 */
export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { style, children, onPressIn, onPressOut, ...props },
  ref
) {
  const [pressed, setPressed] = useState(false);
  const state = { pressed } as PressedState;
  return (
    <NativePressable
      ref={ref}
      {...props}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={typeof style === 'function' ? style(state) : style}
    >
      {typeof children === 'function' ? children(state) : children}
    </NativePressable>
  );
});
