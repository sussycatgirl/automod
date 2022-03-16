import { FunctionComponent, useState } from "react";
import './styles/CategorySelector.css';

const CategorySelector: FunctionComponent<{ keys: { id: string, name: string }[], selected: string, onChange: (key: string) => void }> = (props) => {
    return (
        <div className="category-selector-outer">
            {props.keys.map((k) => (
                <div
                    className={`category-selector-inner ${props.selected == k.id ? 'selected' : ''}`}
                    key={k.id}
                    onClick={() => props.onChange(k.id)}
                >
                    <span>{k.name}</span>
                </div>
            ))}
        </div>
    );
}

export default CategorySelector;
