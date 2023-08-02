import React from "react";
import { View, StyleSheet } from "react-native";
import color from "color";
import { Button, IconButton, useTheme } from "react-native-paper";

const NavBarButton = ({ children, icon, onPressAction }) => {

  const { colors } = useTheme();
  const buttonColor = color(colors.onBackground).alpha(.07).rgb().string();
  const outlineColor = color(colors.onBackground).alpha(.2).rgb().string();

  return (<>
    <Button mode="outlined" buttonColor={buttonColor} textColor={colors.onBackground}
      contentStyle={{ flexDirection: 'row', height: 36 }}
      style={[s.btn, {borderColor: outlineColor}]}
      labelStyle={s.label} onPress={() => onPressAction()}>
      <View style={s.textWrapper}>
        {children}
      </View>
      {icon &&
        <View>
          <IconButton icon={icon} color={colors.onBackground} size={20}
            style={s.icon} />
        </View>
      }
    </Button>
  </>);
};

export const s = StyleSheet.create({
  btn: {
    borderRadius: 10,
    marginLeft: 5,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '400',
    height: '100%',
    marginHorizontal: 'auto',
    marginVertical: 'auto',
    display: 'flex',
  },
  icon: {
    margin: 'auto',
    width: 'auto',
    height: 'auto',
  },
  textWrapper: {
    lineHeight: '100%',
    marginHorizontal: 5,
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
});

export default NavBarButton;
